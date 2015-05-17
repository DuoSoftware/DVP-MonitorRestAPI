var restify = require('restify');
var stringify = require('stringify');
var config = require('config');
var dbHandler = require('./DBBackendHandler.js');
var redisHandler = require('./RedisHandler.js');
var messageFormatter = require('DVP-Common/CommonMessageGenerator/ClientMessageJsonFormatter.js');
var nodeUuid = require('node-uuid');
var logger = require('DVP-Common/LogHandler/CommonLogHandler.js').logger;

var hostIp = config.Host.Ip;
var hostPort = config.Host.Port;
var hostVersion = config.Host.Version;

var server = restify.createServer({
    name: 'localhost',
    version: '1.0.0'
});

server.use(restify.acceptParser(server.acceptable));
server.use(restify.queryParser());
server.use(restify.bodyParser());

var AddToChannelArray = function(reqId, chanTags, chanList, callback)
{
    try
    {
        var len = chanTags.length;
        var count = 0;

        chanTags.forEach(function(tag)
        {
            redisHandler.GetFromHash(reqId, tag, function(err, hashObj)
            {
                if(count < len)
                {
                    var channelData =
                    {
                        ChannelState: hashObj["Channel-State"],
                        FreeSwitchName: hashObj["FreeSWITCH-Switchname"],
                        ChannelName: hashObj["Channel-Name"],
                        CallDirection: hashObj["Call-Direction"],
                        CallerDestinationNumber : hashObj["Caller-Destination-Number"],
                        OtherLegUuid : hashObj["Other-Leg-Unique-ID"],
                        CallType : hashObj["Call-Type"]
                    };

                    chanList.push(channelData);

                    count++;

                    if(count >= len)
                    {
                        callback(err, chanList);
                    }
                }
                else
                {
                    callback(err, chanList);
                }
            })

        });
    }
    catch(ex)
    {
        callback(ex, chanList);
    }
};

var AddToArray = function(reqId, userTags, userList, callback)
{
    try
    {
        var len = userTags.length;
        var count = 0;

        userTags.forEach(function(tag)
        {
                redisHandler.GetFromHash(reqId, tag, function(err, hashObj)
                {
                    if(count < len)
                    {
                        var user = {
                            SipUsername: hashObj.username,
                            RegistrationStatus: hashObj.RegisterState
                        };

                        userList.push(user);

                        count++;

                        if(count >= len)
                        {
                            callback(err, userList);
                        }
                    }
                    else
                    {
                        callback(err, userList);
                    }
                })

        });
    }
    catch(ex)
    {
        callback(ex, userList);
    }
};

var AddToInstanceInfoArray = function(reqId, callServerList, callback)
{
    var instanceInfoList = [];
    try
    {
        var len = callServerList.length;
        var count = 0;

        callServerList.forEach(function(cs)
        {
            var csId = cs.id;
            redisHandler.GetObject(reqId, csId + '#DVP_CS_INSTANCE_INFO', function(err, instanceInfo)
            {
                if(count < len)
                {
                    if(instanceInfo)
                    {
                        var instanceInfoObj = JSON.parse(instanceInfo);

                        instanceInfoList.push(instanceInfoObj);
                    }

                    count++;

                    if(count >= len)
                    {
                        callback(err, instanceInfoList);
                    }

                }
                else
                {
                    callback(err, instanceInfoList);
                }
            })

        });
    }
    catch(ex)
    {
        callback(ex, instanceInfoList);
    }
};

var AddToConferenceDetailArray = function(reqId, confNameTags, confDetailList, callback)
{
    try
    {
        var len = confNameTags.length;
        var count = 0;

        if(count < len)
        {
            confNameTags.forEach(function(tag)
            {
                redisHandler.GetObject(reqId, 'ConferenceNameMap_' + tag, function(err, confId)
                {
                    if(count < len)
                    {
                        if (!err && confId)
                        {
                            redisHandler.GetFromHash(reqId, confId, function(err, hashObj)
                            {
                                if(!err && hashObj)
                                {
                                    var conferenceData =
                                    {
                                        ConferenceId: confId,
                                        ConferenceName: tag,
                                        Data: JSON.parse(hashObj['Data'])
                                    };

                                    confDetailList.push(conferenceData);

                                    count++;

                                    if (count >= len) {
                                        callback(err, confDetailList);
                                    }
                                }
                                else
                                {
                                    count++;

                                    if (count >= len) {
                                        callback(err, confDetailList);
                                    }
                                }
                            })

                        }
                        else
                        {
                            count++;

                            if (count >= len) {
                                callback(err, confDetailList);
                            }
                        }
                    }
                    else
                    {
                        callback(err, confDetailList);
                    }
                })

            });
        }
        else
        {
            callback(undefined, confDetailList);
        }

    }
    catch(ex)
    {
        callback(ex, confDetailList);
    }
};

var AddToConferenceUserArray = function(reqId, confId, confUserTags, confUserList, callback)
{
    try
    {
        var len = confUserTags.length;
        var count = 0;

        if(count < len)
        {
            confUserTags.forEach(function(tag)
            {
                var userHash = "Conference-User-" + confId + "-" + tag;

                if (count < len)
                {
                    redisHandler.GetFromHash(reqId, userHash, function (err, hashObj)
                    {
                        if (!err && hashObj)
                        {
                            var userData =
                            {
                                Username: hashObj['Caller-Username'],
                                UserType: hashObj['Member-Type'],
                                UserState: hashObj['Member-State']
                            };

                            confUserList.push(userData);

                            count++;

                            if (count >= len)
                            {
                                callback(err, confUserList);
                            }
                        }
                        else
                        {
                            count++;

                            if (count >= len)
                            {
                                callback(err, confUserList);
                            }
                        }
                    })

                }
                else
                {
                    callback(undefined, confUserList);
                }


            });
        }
        else
        {
            callback(undefined, confUserList);
        }

    }
    catch(ex)
    {
        callback(ex, confUserList);
    }
};

server.get('/DVP/API/' + hostVersion + '/MonitorRestAPI/GetSipRegDetailsByCompany/:companyId/:tenantId', function(req, res, next)
{
    var reqId = nodeUuid.v1();
    var userList = [];
    try
    {
        var companyId = req.params.companyId;
        var tenantId = req.params.tenantId;

        logger.debug('[DVP-MonitorRestAPI.GetSipRegDetailsByCompany] - [%s] - HTTP Request Received', reqId);

        dbHandler.GetDomainByCompany(companyId, tenantId, function (err, endUser)
        {
            if(endUser && endUser.Domain)
            {
                //Get Registration Details From Redis
                logger.debug('[DVP-MonitorRestAPI.GetSipRegDetailsByCompany] - [%s] - Trying to get tags for user reg - Key : SIPREG@%s', reqId, endUser.Domain);
                redisHandler.GetFromSet(reqId, 'SIPREG@' + endUser.Domain, function(err, userTags)
                {
                    if(userTags && userTags.length > 0)
                    {
                        //get all user hash sets from redis
                        AddToArray(reqId, userTags, userList, function(err, arrRes)
                        {
                            if(err)
                            {
                                logger.error('[DVP-MonitorRestAPI.GetSipRegDetailsByCompany] - [%s] - Exception thrown from method AddToArray', reqId, err);
                                var jsonString = messageFormatter.FormatMessage(err, "", false, arrRes);
                                logger.debug('[DVP-MonitorRestAPI.GetSipRegDetailsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
                                res.end(jsonString);
                            }
                            else
                            {
                                var jsonString = messageFormatter.FormatMessage(err, "", true, arrRes);
                                logger.debug('[DVP-MonitorRestAPI.GetSipRegDetailsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
                                res.end(jsonString);
                            }

                        })
                    }
                    else
                    {
                        logger.warn('[DVP-MonitorRestAPI.GetSipRegDetailsByCompany] - [%s] - No registration tags found on redis', reqId);

                        if(err)
                        {
                            logger.error('[DVP-MonitorRestAPI.GetSipRegDetailsByCompany] - [%s] - Exception thrown from method redisHandler.GetFromSet', reqId, err);
                        }

                        var jsonString = messageFormatter.FormatMessage(err, "", false, userList);
                        logger.debug('[DVP-MonitorRestAPI.GetSipRegDetailsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
                        res.end(jsonString);
                    }
                });

            }
            else
            {
                logger.warn('[DVP-MonitorRestAPI.GetSipRegDetailsByCompany] - [%s] - End user or end user domain not found', reqId);

                if(err)
                {
                    logger.error('[DVP-MonitorRestAPI.GetSipRegDetailsByCompany] - [%s] - Exception thrown from method dbHandler.GetDomainByCompany', reqId, err);
                }
                var jsonString = messageFormatter.FormatMessage(err, "", false, userList);
                logger.debug('[DVP-MonitorRestAPI.GetSipRegDetailsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }
        });
    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.GetSipRegDetailsByCompany] - [%s] - Exception occurred', reqId, ex);
        var jsonStr = JSON.stringify(userList);
        logger.debug('[DVP-MonitorRestAPI.GetSipRegDetailsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonStr);
        res.end(jsonStr);
    }

    return next();

});

server.get('/DVP/API/' + hostVersion + '/MonitorRestAPI/GetSipRegDetailsByUser/:user/:companyId/:tenantId', function(req, res, next)
{
    var reqId = nodeUuid.v1();
    try
    {
        var user = req.params.user;
        var companyId = req.params.companyId;
        var tenantId = req.params.tenantId;

        logger.debug('[DVP-MonitorRestAPI.GetSipRegDetailsByUser] - [%s] - HTTP Request Received - Params - User : %s', reqId, user);

        dbHandler.GetDomainByCompany(companyId, tenantId, function (err, endUser)
        {
            if (endUser && endUser.Domain)
            {
                //Get Registration Details From Redis
                var tag = 'SIPUSER:' + user + "@" + endUser.Domain;

                logger.debug('[DVP-MonitorRestAPI.GetSipRegDetailsByUser] - [%s] - Trying to get user reg hash - Key : %s', reqId, tag);

                redisHandler.GetFromHash(reqId, tag, function (err, hashObj)
                {
                    if(err)
                    {
                        logger.error('[DVP-MonitorRestAPI.GetSipRegDetailsByUser] - [%s] - Exception thrown from method redisHandler.GetFromHash', reqId, err);
                        var jsonString = messageFormatter.FormatMessage(err, "", false, undefined);
                        logger.debug('[DVP-MonitorRestAPI.GetSipRegDetailsByUser] - [%s] - API RESPONSE : %s', reqId, jsonString);
                        res.end(jsonString);
                    }
                    else
                    {
                        var sipUser = {
                            SipUsername: hashObj.username,
                            RegistrationStatus: hashObj.RegisterState,
                            ExtraData: JSON.parse(hashObj.Data)

                        };

                        var jsonString = messageFormatter.FormatMessage(err, "", true, sipUser);
                        logger.debug('[DVP-MonitorRestAPI.GetSipRegDetailsByUser] - [%s] - API RESPONSE : %s', reqId, jsonString);
                        res.end(jsonString);
                    }


                });


            }
            else
            {
                logger.warn('[DVP-MonitorRestAPI.GetSipRegDetailsByUser] - [%s] - End user or end user domain not found', reqId);

                if(err)
                {
                    logger.error('[DVP-MonitorRestAPI.GetSipRegDetailsByUser] - [%s] - Exception thrown from method dbHandler.GetDomainByCompany', reqId, err);
                }

                var jsonString = messageFormatter.FormatMessage(err, "", false, undefined);
                logger.debug('[DVP-MonitorRestAPI.GetSipRegDetailsByUser] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }
        });
    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.GetSipRegDetailsByUser] - [%s] - Exception occurred', reqId, ex);
        var jsonString = messageFormatter.FormatMessage(ex, "", false, undefined);
        logger.debug('[DVP-MonitorRestAPI.GetSipRegDetailsByUser] - [%s] - API RESPONSE : %s', reqId, jsonString);
        res.end(jsonString);
    }

    return next();

});

server.get('/DVP/API/' + hostVersion + '/MonitorRestAPI/GetCallsCount/:instanceId', function(req, res, next)
{
    var reqId = nodeUuid.v1();
    try
    {
        var instanceId = req.params.instanceId;

        logger.debug('[DVP-MonitorRestAPI.GetCallsCount] - [%s] - HTTP Request Received - Params - InstanceId : %s', reqId, instanceId);

        var callCountKey = instanceId + '#DVP_CALL_COUNT';

        logger.debug('[DVP-MonitorRestAPI.GetCallsCount] - [%s] - Trying to get calls count object from redis - Key : %s', reqId, callCountKey);
        redisHandler.GetObject(reqId, callCountKey, function (err, callCount)
        {
            if (err)
            {
                logger.error('[DVP-MonitorRestAPI.GetCallsCount] - [%s] - Exception thrown from method redisHandler.GetObject', reqId, err);
                var jsonString = messageFormatter.FormatMessage(err, "", false, 0);
                logger.debug('[DVP-MonitorRestAPI.GetCallsCount] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }
            else
            {
                var jsonString = messageFormatter.FormatMessage(err, "", true, callCount);
                logger.debug('[DVP-MonitorRestAPI.GetCallsCount] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }


        });
    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.GetCallsCount] - [%s] - Exception occurred', reqId, ex);
        var jsonString = messageFormatter.FormatMessage(ex, "", false, 0);
        logger.debug('[DVP-MonitorRestAPI.GetCallsCount] - [%s] - API RESPONSE : %s', reqId, jsonString);
        res.end(jsonString);
    }

    return next();

});

server.get('/DVP/API/' + hostVersion + '/MonitorRestAPI/GetInstanceResourceUtilization/:instanceId', function(req, res, next)
{
    var reqId = nodeUuid.v1();
    try
    {
        var instanceId = req.params.instanceId;

        logger.debug('[DVP-MonitorRestAPI.GetInstanceResourceUtilization] - [%s] - HTTP Request Received - Params - InstanceId : %s', reqId, instanceId);

        var instanceInfoKey = instanceId + '##DVP_CS_INSTANCE_INFO';

        logger.debug('[DVP-MonitorRestAPI.GetInstanceResourceUtilization] - [%s] - Trying to get instance utilization object from redis - Key : %s', reqId, instanceInfoKey);
        redisHandler.GetObject(reqId, instanceInfoKey, function (err, instanceInf)
        {
            if (err)
            {
                logger.error('[DVP-MonitorRestAPI.GetInstanceResourceUtilization] - [%s] - Exception thrown from method redisHandler.GetObject', reqId, err);
                var jsonString = messageFormatter.FormatMessage(err, "", false, instanceInf);
                logger.debug('[DVP-MonitorRestAPI.GetInstanceResourceUtilization] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }
            else
            {
                var jsonString = messageFormatter.FormatMessage(err, "", true, instanceInf);
                logger.debug('[DVP-MonitorRestAPI.GetInstanceResourceUtilization] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }

        });
    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.GetCallsCount] - [%s] - Exception occurred', reqId, ex);
        var jsonString = messageFormatter.FormatMessage(ex, "", false, undefined);
        logger.debug('[DVP-MonitorRestAPI.GetInstanceResourceUtilization] - [%s] - API RESPONSE : %s', reqId, jsonString);
        res.end(jsonString);
    }

    return next();

});

server.get('/DVP/API/' + hostVersion + '/MonitorRestAPI/GetClusterResourceUtilization/:clusterId', function(req, res, next)
{
    var reqId = nodeUuid.v1();
    var emptyArr = [];
    try
    {
        var clusterId = req.params.clusterId;

        logger.debug('[DVP-MonitorRestAPI.GetClusterResourceUtilization] - [%s] - HTTP Request Received - Params - clusterId : %s', reqId, clusterId);


        logger.debug('[DVP-MonitorRestAPI.GetClusterResourceUtilization] - [%s] - Trying to get servers for cluster from db', reqId);

        dbHandler.GetCallServersForCluster(reqId, clusterId, function(err, result)
        {
            if(err || !result)
            {
                var jsonString = messageFormatter.FormatMessage(err, "", false, emptyArr);
                logger.debug('[DVP-MonitorRestAPI.GetClusterResourceUtilization] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }
            else
            {
                if(result.CallServer && result.CallServer.length > 0)
                {
                    AddToInstanceInfoArray(reqId, result.CallServer, function(err, infoList)
                    {
                        var jsonString = messageFormatter.FormatMessage(err, "", true, infoList);
                        logger.debug('[DVP-MonitorRestAPI.GetClusterResourceUtilization] - [%s] - API RESPONSE : %s', reqId, jsonString);
                        res.end(jsonString);
                    })
                }
                else
                {
                    var jsonString = messageFormatter.FormatMessage(err, "", false, emptyArr);
                    logger.debug('[DVP-MonitorRestAPI.GetClusterResourceUtilization] - [%s] - API RESPONSE : %s', reqId, jsonString);
                    res.end(jsonString);
                }
            }
        });
    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.GetClusterResourceUtilization] - [%s] - Exception occurred', reqId, ex);
        var jsonString = messageFormatter.FormatMessage(ex, "", false, emptyArr);
        logger.debug('[DVP-MonitorRestAPI.GetClusterResourceUtilization] - [%s] - API RESPONSE : %s', reqId, jsonString);
        res.end(jsonString);
    }

    return next();

});

server.get('/DVP/API/' + hostVersion + '/MonitorRestAPI/GetChannelCount/:instanceId', function(req, res, next)
{
    var reqId = nodeUuid.v1();
    try
    {
        var instanceId = req.params.instanceId;

        logger.debug('[DVP-MonitorRestAPI.GetChannelCount] - [%s] - HTTP Request Received GetChannelCount - Params - instanceId : %s', reqId, instanceId);

        var channelCountKey = instanceId + '#DVP_CHANNEL_COUNT';

        logger.debug('[DVP-MonitorRestAPI.GetChannelCount] - [%s] - Trying to get channel count from redis - Key : %s', reqId, channelCountKey);

        redisHandler.GetObject(reqId, channelCountKey, function (err, chanCount)
        {
            if (err)
            {
                logger.error('[DVP-MonitorRestAPI.GetChannelCount] - [%s] - Exception thrown from redisHandler.GetObject', reqId, err);
                var jsonString = messageFormatter.FormatMessage(err, "", false, 0);
                logger.debug('[DVP-MonitorRestAPI.GetChannelCount] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }
            else
            {
                logger.debug('[DVP-MonitorRestAPI.GetChannelCount] - [%s] - API RESPONSE : %s', reqId, chanCount);
                var jsonString = messageFormatter.FormatMessage(err, "", true, chanCount);
                logger.debug('[DVP-MonitorRestAPI.GetChannelCount] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }

        });
    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.GetChannelCount] - [%s] - Exception occurred', reqId, ex);
        var jsonString = messageFormatter.FormatMessage(ex, "", false, 0);
        logger.debug('[DVP-MonitorRestAPI.GetChannelCount] - [%s] - API RESPONSE : %s', reqId, jsonString);
        res.end(jsonString);
    }

    return next();

});

server.get('/DVP/API/' + hostVersion + '/MonitorRestAPI/GetChannelById/:channelId', function(req, res, next)
{
    var reqId = nodeUuid.v1();
    try
    {
        var channelId = req.params.channelId;

        logger.debug('[DVP-MonitorRestAPI.GetChannelById] - [%s] - HTTP Request Received GetChannelById - Params - channelId : %s', reqId, channelId);
        //Get Registration Details From Redis

        logger.debug('[DVP-MonitorRestAPI.GetChannelById] - [%s] - Trying to get channel details from redis - Key : %s', reqId, channelId);

        redisHandler.GetFromHash(reqId, channelId, function (err, hashObj)
        {
            if (err)
            {
                logger.error('[DVP-MonitorRestAPI.GetChannelById] - [%s] - Exception thrown from redisHandler.GetObject', reqId, err);
                var jsonString = messageFormatter.FormatMessage(err, "", false, undefined);
                logger.debug('[DVP-MonitorRestAPI.GetChannelById] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }
            else
            {
                var channelData =
                {
                    ChannelState: hashObj["Channel-State"],
                    FreeSwitchName: hashObj["FreeSWITCH-Switchname"],
                    ChannelName: hashObj["Channel-Name"],
                    CallDirection: hashObj["Call-Direction"],
                    CallerDestinationNumber : hashObj["Caller-Destination-Number"],
                    OtherLegUuid : hashObj["Other-Leg-Unique-ID"],
                    CallType : hashObj["Call-Type"]
                };

                var jsonString = messageFormatter.FormatMessage(err, "", true, channelData);
                logger.debug('[DVP-MonitorRestAPI.GetChannelById] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }


        });
    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.GetChannelById] - [%s] - Exception occurred', reqId, ex);
        var jsonString = messageFormatter.FormatMessage(ex, "ERROR", false, undefined);
        res.end(jsonString);
    }

    return next();

});

server.get('/DVP/API/' + hostVersion + '/MonitorRestAPI/GetChannelsByCompany/:companyId/:tenantId', function(req, res, next)
{
    var reqId = nodeUuid.v1();
    var chanList = [];
    try
    {
        var companyId = req.params.companyId;
        var tenantId = req.params.tenantId;

        logger.debug('[DVP-MonitorRestAPI.GetChannelsByCompany] - [%s] - HTTP Request Received GetChannelsByCompany', reqId);


        dbHandler.GetDomainByCompany(reqId, companyId, tenantId, function (err, endUser)
        {
            if(endUser && endUser.Domain)
            {
                //Get Registration Details From Redis
                var setKey = 'CHANNEL@' + endUser.Domain;
                logger.debug('[DVP-MonitorRestAPI.GetChannelsByCompany] - [%s] - Trying to get channels set for company from redis - Key : %s', reqId, setKey);
                redisHandler.GetFromSet(reqId, setKey, function(err, chanTags)
                {
                    if(chanTags && chanTags.length > 0)
                    {
                        //get all user hash sets from redis
                        AddToChannelArray(reqId, chanTags, chanList, function(err, arrRes)
                        {
                            if(err)
                            {
                                logger.error('[DVP-MonitorRestAPI.GetChannelsByCompany] - [%s] - Exception thrown from redisHandler.AddToChannelArray', reqId, err);
                                var jsonString = messageFormatter.FormatMessage(err, "", false, chanList);
                                logger.debug('[DVP-MonitorRestAPI.GetChannelsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
                                res.end(jsonString);
                            }
                            else
                            {
                                var jsonString = messageFormatter.FormatMessage(err, "", true, chanList);
                                logger.debug('[DVP-MonitorRestAPI.GetChannelsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
                                res.end(jsonString);
                            }

                        })
                    }
                    else
                    {
                        var jsonString = messageFormatter.FormatMessage(err, "", false, chanList);
                        logger.debug('[DVP-MonitorRestAPI.GetChannelsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
                        res.end(jsonString);
                    }
                });

            }
            else
            {
                var jsonString = messageFormatter.FormatMessage(err, "", true, chanList);
                logger.debug('[DVP-MonitorRestAPI.GetChannelsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }
        });

        return next();
    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.GetChannelsByCompany] - [%s] - Exception occurred', reqId, ex);
        var jsonString = messageFormatter.FormatMessage(ex, "", true, chanList);
        logger.debug('[DVP-MonitorRestAPI.GetChannelsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
        res.end(jsonString);
    }

    return next();

});

server.get('/DVP/API/' + hostVersion + '/MonitorRestAPI/GetConferenceRoomsByCompany/:companyId/:tenantId', function(req, res, next)
{
    var emptyConfList = [];
    var reqId = nodeUuid.v1();
    try
    {
        var companyId = req.params.companyId;
        var tenantId = req.params.tenantId;

        logger.debug('[DVP-MonitorRestAPI.GetConferenceRoomsByCompany] - [%s] - HTTP Request Received GetConferenceRoomsByCompany', reqId);

        dbHandler.GetConferenceListByCompany(reqId, companyId, tenantId, function (err, confList)
        {
            if(err)
            {
                logger.error('[DVP-MonitorRestAPI.GetConferenceRoomsByCompany] - [%s] - Exception thrown from dbHandler.GetConferenceListByCompany', reqId, err);
                var jsonString = messageFormatter.FormatMessage(err, "", false, confList);
                logger.debug('[DVP-MonitorRestAPI.GetConferenceRoomsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }
            else
            {
                if (confList && confList.length > 0)
                {
                    //Get Registration Details From Redis
                    var tagList = [];
                    var confDetailList = [];

                    confList.forEach(function(conf)
                    {
                        var tag = conf.ConferenceName;
                        tagList.push(tag);
                    });

                    AddToConferenceDetailArray(reqId, tagList, confDetailList, function(err, confList)
                    {
                        if(err)
                        {
                            logger.error('[DVP-MonitorRestAPI.GetConferenceRoomsByCompany] - [%s] - Exception thrown from AddToConferenceDetailArray', reqId, err);
                            var jsonString = messageFormatter.FormatMessage(err, "", false, confList);
                            logger.debug('[DVP-MonitorRestAPI.GetConferenceRoomsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
                            res.end(jsonString);
                        }
                        else
                        {
                            var jsonString = messageFormatter.FormatMessage(err, "", true, confList);
                            logger.debug('[DVP-MonitorRestAPI.GetConferenceRoomsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
                            res.end(jsonString);
                        }
                    })

                }
                else
                {
                    var jsonString = messageFormatter.FormatMessage(err, "", false, emptyConfList);
                    logger.debug('[DVP-MonitorRestAPI.GetConferenceRoomsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
                    res.end(jsonString);
                }
            }

        });

    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.GetConferenceRoomsByCompany] - [%s] - Exception occurred', reqId, ex);
        var jsonString = messageFormatter.FormatMessage(ex, "", false, emptyConfList);
        logger.debug('[DVP-MonitorRestAPI.GetConferenceRoomsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
        res.end(jsonString);
    }

    return next();

});

server.get('/DVP/API/' + hostVersion + '/MonitorRestAPI/GetConferenceUsers/:roomName/:companyId/:tenantId', function(req, res, next)
{
    var confUserList = [];
    var reqId = nodeUuid.v1();
    try
    {
        var roomName = req.params.roomName;
        var companyId = req.params.companyId;
        var tenantId = req.params.tenantId;

        logger.debug('[DVP-MonitorRestAPI.GetConferenceUsers] - [%s] - HTTP Request Received GetConferenceUsers - Params - roomName : %s', reqId, roomName);


        dbHandler.GetConferenceRoomWithCompany(reqId, roomName, companyId, tenantId, function (err, conf)
        {
            if(err)
            {
                logger.error('[DVP-MonitorRestAPI.GetConferenceUsers] - [%s] - Exception thrown from dbHandler.GetConferenceRoomWithCompany', reqId, err);
                var jsonString = messageFormatter.FormatMessage(err, "", false, confUserList);
                logger.debug('[DVP-MonitorRestAPI.GetConferenceUsers] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }
            else
            {
                if (conf)
                {
                    //Get Registration Details From Redis
                    var confRedisKey = 'ConferenceNameMap_' + roomName;

                    logger.debug('[DVP-MonitorRestAPI.GetConferenceUsers] - [%s] - Trying to get conference details from redis - Key : %s', reqId, confRedisKey);

                    redisHandler.GetObject(reqId, confRedisKey, function(err, confId)
                    {
                       if(!err && confId)
                       {
                           var confUserKey = 'Conference-Member-List-' + confId;

                           logger.debug('[DVP-MonitorRestAPI.GetConferenceUsers] - [%s] - Trying to get conference user details from redis set - Key : %s', reqId, confUserKey);

                           redisHandler.GetFromSet(reqId, confUserKey, function(err, usersArr)
                           {
                               if(!err && usersArr && usersArr.length > 0)
                               {

                                   AddToConferenceUserArray(reqId, confId, usersArr, confUserList, function(err, usrList)
                                   {
                                       if(!err && usrList)
                                       {
                                           var jsonString = messageFormatter.FormatMessage(err, "", true, usrList);
                                           logger.debug('[DVP-MonitorRestAPI.GetConferenceUsers] - [%s] - API RESPONSE : %s', reqId, jsonString);
                                           res.end(jsonString);
                                       }
                                       else
                                       {
                                           var jsonString = messageFormatter.FormatMessage(err, "", true, usrList);
                                           logger.debug('[DVP-MonitorRestAPI.GetConferenceUsers] - [%s] - API RESPONSE : %s', reqId, jsonString);
                                           res.end(jsonString);
                                       }
                                   })


                               }
                               else
                               {
                                   var jsonString = messageFormatter.FormatMessage(err, "", false, confUserList);
                                   logger.debug('[DVP-MonitorRestAPI.GetConferenceUsers] - [%s] - API RESPONSE : %s', reqId, jsonString);
                                   res.end(jsonString);
                               }

                           })
                       }
                       else
                       {
                           var jsonString = messageFormatter.FormatMessage(err, "", false, confUserList);
                           logger.debug('[DVP-MonitorRestAPI.GetConferenceUsers] - [%s] - API RESPONSE : %s', reqId, jsonString);
                           res.end(jsonString);
                       }
                    });

                }
                else
                {
                    var jsonString = messageFormatter.FormatMessage(err, "", false, confUserList);
                    logger.debug('[DVP-MonitorRestAPI.GetConferenceUsers] - [%s] - API RESPONSE : %s', reqId, jsonString);
                    res.end(jsonString);
                }
            }

        });
    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.GetConferenceUsers] - [%s] - Exception occurred', reqId, ex);
        var jsonString = messageFormatter.FormatMessage(ex, "", false, confUserList);
        logger.debug('[DVP-MonitorRestAPI.GetConferenceUsers] - [%s] - API RESPONSE : %s', reqId, jsonString);
        res.end(jsonString);
    }

    return next();

});

server.listen(hostPort, hostIp, function () {
    console.log('%s listening at %s', server.name, server.url);
});