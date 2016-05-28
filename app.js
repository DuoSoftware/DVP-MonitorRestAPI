var restify = require('restify');
var stringify = require('stringify');
var config = require('config');
var dbHandler = require('./DBBackendHandler.js');
var dispatchHandler = require('./DispatchHandler');
var redisHandler = require('./RedisHandler.js');
var messageFormatter = require('dvp-common/CommonMessageGenerator/ClientMessageJsonFormatter.js');
var nodeUuid = require('node-uuid');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;
var jwt = require('restify-jwt');
var secret = require('dvp-common/Authentication/Secret.js');
var authorization = require('dvp-common/Authentication/Authorization.js');

var hostIp = config.Host.Ip;
var hostPort = config.Host.Port;
var hostVersion = config.Host.Version;


var server = restify.createServer({
    name: 'localhost',
    version: '1.0.0'
});



server.use(restify.CORS());
server.use(restify.fullResponse());
server.pre(restify.pre.userAgentConnection());


restify.CORS.ALLOW_HEADERS.push('authorization');

server.use(restify.acceptParser(server.acceptable));
server.use(restify.queryParser());
server.use(restify.bodyParser());
server.use(jwt({secret: secret.Secret}));



var CreateOnGoingCallList = function(reqId, setId, callback)
{
    var arr = {};
    try
    {
        redisHandler.GetFromSet(reqId, setId, function(err, callList)
        {
            if(err)
            {
                callback(err, arr);
            }
            else
            {
                var current = 0;
                var count = callList.length;


                if(count)
                {
                    for(i=0; i<callList.length; i++)
                    {
                        //HMGET

                        redisHandler.GetFromHash(reqId, callList[i], function(err, hash)
                        {
                            if(hash)
                            {
                                var key = hash['Caller-Unique-ID'];
                                arr[key] = hash;
                            }
                            if(current <= count)
                            {
                                current++;

                                if(current >= count)
                                {
                                    callback(undefined, arr);
                                }
                            }
                            else
                            {
                                callback(undefined, arr);
                            }
                        });



                        //FindLegsForCall(reqId, callList[i], calls, function(err, callList)
                        //{
                        //    if(current < count)
                        //    {
                        //        current++;
                        //
                        //        if(current >= count)
                        //        {
                        //            callback(undefined, calls);
                        //        }
                        //    }
                        //    else
                        //    {
                        //        callback(undefined, calls);
                        //    }
                        //
                        //})

                    }
                }
                else
                {
                    callback(null, arr);
                }

            }
        })
    }
    catch(ex)
    {
        callback(ex, arr);

    }
}

var CollectLegsForCallId = function(reqId, callUuid, chanObj, callback)
{
    //var chanObj = {"Channels" : {}};

    try
    {
        redisHandler.GetFromHash(reqId, callUuid, function(err, legData)
        {
            if(err)
            {
                callback(err, chanObj)
            }
            else
            {
                if(legData)
                {
                    chanObj.Channels[callUuid] = legData;

                    var otherLegUuid = legData["Other-Leg-Unique-ID"];

                    if(otherLegUuid && !chanObj.Channels[otherLegUuid])
                    {
                        CollectLegsForCallId(reqId, otherLegUuid, chanObj, function(err, chanList)
                        {
                            callback(err, chanList);
                        })
                    }
                    else
                    {
                        callback(undefined, chanObj)
                    }

                }
                else
                {
                    callback(undefined, chanObj)
                }
            }
        })
    }
    catch(ex)
    {
        callback(ex, chanObj)
    }
}


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

var OtherLegHandler = function(reqId, calls, usedChanList, callChannels, hashList, hashObj, hashKey)
{
    if(!usedChanList.indexOf(hashKey))
    {
        callChannels.push(hashObj);

        if(hashObj.OtherLegUuid)
        {
            if(usedChanList.indexOf(hashObj.OtherLegUuid))
            {
                calls
            }
            var tempHashObj = hashList[hashObj.OtherLegUuid];
            OtherLegHandler(reqId, calls, usedChanList, callChannels, hashList, tempHashObj, hashObj.OtherLegUuid);

        }
        else
        {
            calls.push(callChannels);
        }
    }

}

server.get('/DVP/API/:version/MonitorRestAPI/SipRegistrations', authorization({resource:"sysmonitoring", action:"read"}), function(req, res, next)
{
    var reqId = nodeUuid.v1();
    var userList = [];
    try
    {
        var companyId = req.user.company;
        var tenantId = req.user.tenant;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }

        logger.debug('[DVP-MonitorRestAPI.GetSipRegDetailsByCompany] - [%s] - HTTP Request Received', reqId);

        dbHandler.GetDomainByCompany(reqId, companyId, tenantId, function (err, endUser)
        {
            if(endUser && endUser.Domain)
            {
                //Get Registration Details From Redis
                logger.debug('[DVP-MonitorRestAPI.GetSipRegDetailsByCompany] - [%s] - Trying to get tags for user reg - Key : SIPPRESENCE:%s', reqId, endUser.Domain);
                redisHandler.GetKeys(reqId, 'SIPPRESENCE:' + endUser.Domain + ':*', function(err, userTags)
                {
                    if(userTags && userTags.length > 0)
                    {
                        //get all user hash sets from redis

                        redisHandler.MGetObjects(reqId, userTags, function(err, userList)
                        {
                            if(err)
                            {
                                var jsonString = messageFormatter.FormatMessage(err, "", false, userList);
                                logger.debug('[DVP-MonitorRestAPI.GetSipRegDetailsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
                                res.end(jsonString);
                            }
                            else
                            {
                                var tempArr = [];
                                for(i=0; i<userList.length; i++)
                                {
                                    tempArr.push(JSON.parse(userList[i]));
                                }

                                var jsonString = messageFormatter.FormatMessage(err, "", true, tempArr);
                                logger.debug('[DVP-MonitorRestAPI.GetSipRegDetailsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
                                res.end(jsonString);
                            }
                        });

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

server.get('/DVP/API/:version/MonitorRestAPI/SipRegistrations/User/:user', authorization({resource:"sysmonitoring", action:"read"}), function(req, res, next)
{
    var reqId = nodeUuid.v1();
    try
    {
        var user = req.params.user;
        var companyId = req.user.company;
        var tenantId = req.user.tenant;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }

        logger.debug('[DVP-MonitorRestAPI.GetSipRegDetailsByUser] - [%s] - HTTP Request Received - Params - User : %s', reqId, user);

        dbHandler.GetDomainByCompany(reqId, companyId, tenantId, function (err, endUser)
        {
            if (endUser && endUser.Domain)
            {
                //Get Registration Details From Redis
                var tag = 'SIPPRESENCE:' + endUser.Domain + ":" + user;

                logger.debug('[DVP-MonitorRestAPI.GetSipRegDetailsByUser] - [%s] - Trying to get user reg hash - Key : %s', reqId, tag);

                redisHandler.GetObject(reqId, tag, function (err, obj)
                {
                    if(err)
                    {
                        var jsonString = messageFormatter.FormatMessage(err, "", false, undefined);
                        logger.debug('[DVP-MonitorRestAPI.GetSipRegDetailsByUser] - [%s] - API RESPONSE : %s', reqId, jsonString);
                        res.end(jsonString);
                    }
                    else
                    {
                        var sipUser = {};
                        if(obj)
                        {
                            obj = JSON.parse(obj);

                            sipUser = {
                                SipUsername: obj.SipUsername,
                                Domain: obj.Domain,
                                Status: obj.Status

                            };
                        }


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

server.get('/DVP/API/:version/MonitorRestAPI/FSInstance/:instanceId/Calls/Count', authorization({resource:"sysmonitoring", action:"read"}), function(req, res, next)
{
    var reqId = nodeUuid.v1();
    try
    {
        var instanceId = req.params.instanceId;

        logger.debug('[DVP-MonitorRestAPI.GetCallsCount] - [%s] - HTTP Request Received - Params - InstanceId : %s', reqId, instanceId);

        var companyId = req.user.company;
        var tenantId = req.user.tenant;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }

        var callCountKey = 'DVP_CALL_COUNT_INSTANCE:' + instanceId;

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

server.get('/DVP/API/:version/MonitorRestAPI/Calls/Count', authorization({resource:"sysmonitoring", action:"read"}), function(req, res, next)
{
    var reqId = nodeUuid.v1();
    try
    {
        logger.debug('[DVP-MonitorRestAPI.GetCallsCount] - [%s] - HTTP Request Received', reqId);

        var companyId = req.user.company;
        var tenantId = req.user.tenant;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }

        var callCountKey = 'DVP_CALL_COUNT_COMPANY:' + tenantId + ':' + companyId;

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

server.get('/DVP/API/:version/MonitorRestAPI/Channels/Count', authorization({resource:"sysmonitoring", action:"read"}), function(req, res, next)
{
    var reqId = nodeUuid.v1();
    try
    {
        logger.debug('[DVP-MonitorRestAPI.GetChannelsCount] - [%s] - HTTP Request Received', reqId);

        var companyId = req.user.company;
        var tenantId = req.user.tenant;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }

        var callCountKey = 'DVP_CHANNEL_COUNT_COMPANY:' + tenantId + ':' + companyId;

        logger.debug('[DVP-MonitorRestAPI.GetChannelsCount] - [%s] - Trying to get calls count object from redis - Key : %s', reqId, callCountKey);
        redisHandler.GetObject(reqId, callCountKey, function (err, callCount)
        {
            if (err)
            {
                logger.error('[DVP-MonitorRestAPI.GetChannelsCount] - [%s] - Exception thrown from method redisHandler.GetObject', reqId, err);
                var jsonString = messageFormatter.FormatMessage(err, "", false, 0);
                logger.debug('[DVP-MonitorRestAPI.GetChannelsCount] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }
            else
            {
                var jsonString = messageFormatter.FormatMessage(err, "", true, callCount);
                logger.debug('[DVP-MonitorRestAPI.GetChannelsCount] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }


        });
    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.GetChannelsCount] - [%s] - Exception occurred', reqId, ex);
        var jsonString = messageFormatter.FormatMessage(ex, "", false, 0);
        logger.debug('[DVP-MonitorRestAPI.GetChannelsCount] - [%s] - API RESPONSE : %s', reqId, jsonString);
        res.end(jsonString);
    }

    return next();

});

server.get('/DVP/API/:version/MonitorRestAPI/FSInstance/:instanceId/ResourceUtilization', authorization({resource:"sysmonitoring", action:"read"}), function(req, res, next)
{
    var reqId = nodeUuid.v1();
    try
    {
        var instanceId = req.params.instanceId;

        logger.debug('[DVP-MonitorRestAPI.GetInstanceResourceUtilization] - [%s] - HTTP Request Received - Params - InstanceId : %s', reqId, instanceId);

        var companyId = req.user.company;
        var tenantId = req.user.tenant;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }

        var instanceInfoKey = instanceId + '#DVP_CS_INSTANCE_INFO';

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
                var jsonString = messageFormatter.FormatMessage(err, "", true, JSON.parse(instanceInf));
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

server.get('/DVP/API/:version/MonitorRestAPI/Cluster/:clusterId/ResourceUtilization', authorization({resource:"sysmonitoring", action:"read"}), function(req, res, next)
{
    var reqId = nodeUuid.v1();
    var emptyArr = [];
    try
    {
        var clusterId = req.params.clusterId;

        logger.debug('[DVP-MonitorRestAPI.GetClusterResourceUtilization] - [%s] - HTTP Request Received - Params - clusterId : %s', reqId, clusterId);

        var companyId = req.user.company;
        var tenantId = req.user.tenant;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }


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

server.get('/DVP/API/:version/MonitorRestAPI/FSInstance/:instanceId/Channel/Count', authorization({resource:"sysmonitoring", action:"read"}), function(req, res, next)
{
    var reqId = nodeUuid.v1();
    try
    {
        var instanceId = req.params.instanceId;

        logger.debug('[DVP-MonitorRestAPI.GetChannelCount] - [%s] - HTTP Request Received GetChannelCount - Params - instanceId : %s', reqId, instanceId);

        var companyId = req.user.company;
        var tenantId = req.user.tenant;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }

        var channelCountKey = 'DVP_CHANNEL_COUNT_INSTANCE:' + instanceId;

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

server.get('/DVP/API/:version/MonitorRestAPI/Channel/:channelId', authorization({resource:"sysmonitoring", action:"read"}), function(req, res, next)
{
    var reqId = nodeUuid.v1();
    try
    {
        var channelId = req.params.channelId;

        logger.debug('[DVP-MonitorRestAPI.GetChannelById] - [%s] - HTTP Request Received GetChannelById - Params - channelId : %s', reqId, channelId);

        var companyId = req.user.company;
        var tenantId = req.user.tenant;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }
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

server.get('/DVP/API/:version/MonitorRestAPI/Channels', authorization({resource:"sysmonitoring", action:"read"}), function(req, res, next)
{
    var reqId = nodeUuid.v1();
    var chanList = [];
    try
    {
        var companyId = req.user.company;
        var tenantId = req.user.tenant;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }

        logger.debug('[DVP-MonitorRestAPI.GetChannelsByCompany] - [%s] - HTTP Request Received GetChannelsByCompany', reqId);

        var setKey = "CHANNELS:" + tenantId + ":" + companyId;
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

server.get('/DVP/API/:version/MonitorRestAPI/Calls', authorization({resource:"sysmonitoring", action:"read"}), function(req, res, next)
{
    var reqId = nodeUuid.v1();
    var chanList = [];
    try
    {
        var companyId = req.user.company;
        var tenantId = req.user.tenant;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }

        logger.debug('[DVP-MonitorRestAPI.GetCallsByCompany] - [%s] - HTTP Request Received GetCallsByCompany', reqId);

        var setKey = "CHANNELS:" + tenantId + ":" + companyId;

        CreateOnGoingCallList(reqId, setKey, function(err, hashList)
        {
            var calls = {};

            //hashList = {
            //    "1":{"Name": "www"},
            //    "2":{"Name": "ttt", "OtherLegUuid": "3"},
            //    "3":{"Name": "rrr", "OtherLegUuid": "2"},
            //    "4":{"Name": "yyy", "OtherLegUuid": "6"},
            //    "5":{"Name": "uuu", "OtherLegUuid": "6"},
            //    "6":{"Name": "iii", "OtherLegUuid": "4"}
            //};

            var usedChanList = {};
            var otherLegChanList = {};

            for(var key in hashList)
            {
                if(!usedChanList[key])
                {
                    var callChannels = [];
                    var otherLegUuid = hashList[key]['Other-Leg-Unique-ID'];
                    if(!otherLegUuid)
                    {
                        //

                        var otherlegKey = otherLegChanList[key];

                        if(otherlegKey)
                        {
                            calls[otherlegKey].push(hashList[key]);
                            usedChanList[key] = key;
                        }
                        else
                        {
                            callChannels.push(hashList[key]);

                            usedChanList[key] = key;

                            calls[key] = callChannels;
                        }

                        //

                    }
                    else
                    {

                        if(usedChanList[otherLegUuid])
                        {
                            var chanListId = usedChanList[otherLegUuid];

                            calls[chanListId].push(hashList[key]);

                            usedChanList[key] = chanListId;

                            if(!otherLegChanList[otherLegUuid])
                            {
                                otherLegChanList[otherLegUuid] = key;
                            }

                        }
                        else
                        {
                            if(otherLegChanList[otherLegUuid])
                            {
                                var chanListId = otherLegChanList[otherLegUuid];
                                calls[chanListId].push(hashList[key]);
                            }
                            else
                            {
                                callChannels.push(hashList[key]);
                                usedChanList[key] = key;
                                otherLegChanList[otherLegUuid] = key;
                                calls[key] = callChannels;
                            }

                        }
                    }
                }

            }

            var jsonString = messageFormatter.FormatMessage(undefined, "Operation Successfull", true, calls);
            logger.debug('[DVP-MonitorRestAPI.GetCallsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
            res.end(jsonString);



            //if(err)
            //{
            //    logger.error('[DVP-MonitorRestAPI.GetCallsByCompany] - [%s] - Exception occurred', reqId, err);
            //    var jsonString = messageFormatter.FormatMessage(err, "ERROR Occurred", false, callList);
            //    logger.debug('[DVP-MonitorRestAPI.GetCallsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
            //    res.end(jsonString);
            //}
            //else
            //{
            //    var jsonString = messageFormatter.FormatMessage(undefined, "Operation Successfull", true, callList);
            //    logger.debug('[DVP-MonitorRestAPI.GetCallsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
            //    res.end(jsonString);
            //}
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

server.get('/DVP/API/:version/MonitorRestAPI/Calls/Application/:appId', function(req, res, next)
{
    var reqId = nodeUuid.v1();
    var appId = req.params.appId;
    var chanList = [];
    try
    {
        var companyId = 1;
        var tenantId = 1;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }

        logger.debug('[DVP-MonitorRestAPI.GetCallsByAppId] - [%s] - HTTP Request Received GetCallsByCompany', reqId);

        var setKey = "CHANNELS_APP:" + appId;

        //validate app

        dbHandler.GetAppByCompany(reqId, appId, companyId, tenantId, function(err, app)
        {
            if(app)
            {
                CreateOnGoingCallList(reqId, setKey, function(err, callList)
                {
                    if(err)
                    {
                        logger.error('[DVP-MonitorRestAPI.GetCallsByCompany] - [%s] - Exception occurred', reqId, err);
                        var jsonString = messageFormatter.FormatMessage(err, "ERROR Occurred", false, callList);
                        logger.debug('[DVP-MonitorRestAPI.GetCallsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
                        res.end(jsonString);
                    }
                    else
                    {
                        var jsonString = messageFormatter.FormatMessage(undefined, "Operation Successfull", true, callList);
                        logger.debug('[DVP-MonitorRestAPI.GetCallsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
                        res.end(jsonString);
                    }
                });
            }
            else
            {
                var jsonString = messageFormatter.FormatMessage(err, "App not found", false, undefined);
                logger.debug('[DVP-MonitorRestAPI.GetCallsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
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

server.get('/DVP/API/:version/MonitorRestAPI/Conferences', authorization({resource:"sysmonitoring", action:"read"}), function(req, res, next)
{
    var emptyConfList = [];
    var reqId = nodeUuid.v1();
    try
    {
        var companyId = req.user.company;
        var tenantId = req.user.tenant;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }

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

server.get('/DVP/API/:version/MonitorRestAPI/Conference/:roomName/Users', authorization({resource:"sysmonitoring", action:"read"}), function(req, res, next)
{
    var confUserList = [];
    var reqId = nodeUuid.v1();
    try
    {
        var roomName = req.params.roomName;

        var companyId = req.user.company;
        var tenantId = req.user.tenant;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }

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


server.get('/DVP/API/:version/MonitorRestAPI/Conference/:conferenceName/Calls/Count', authorization({resource:"sysmonitoring", action:"read"}), function(req, res, next)
{
    var reqId = nodeUuid.v1();
    var roomName = req.params.conferenceName;
    logger.debug('[DVP-MonitorRestAPI.GetCallCountForConference] - [%s] - HTTP Request Received - params : %s', reqId, roomName);

    try
    {
        var companyId = req.user.company;
        var tenantId = req.user.tenant;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }

        dbHandler.GetConferenceRoomWithCompany(reqId, roomName, companyId, tenantId, function(err, conf)
        {
            if(err)
            {
                var jsonString = messageFormatter.FormatMessage(err, "", false, 0);
                logger.debug('[DVP-MonitorRestAPI.GetCallCountForConference] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }
            else
            {
                if(conf)
                {
                    redisHandler.GetObject(reqId, 'CONFERENCE-COUNT:' + roomName, function(err, redisResp)
                    {
                        if(err)
                        {
                            var jsonString = messageFormatter.FormatMessage(err, "Error Occurred", false, 0);
                            logger.debug('[DVP-MonitorRestAPI.GetCallCountForConference] - [%s] - API RESPONSE : %s', reqId, jsonString);
                            res.end(jsonString);
                        }
                        else
                        {
                            var jsonString = messageFormatter.FormatMessage(null, "Success", true, redisResp);
                            logger.debug('[DVP-MonitorRestAPI.GetCallCountForConference] - [%s] - API RESPONSE : %s', reqId, jsonString);
                            res.end(jsonString);
                        }
                    });

                }
                else
                {
                    var jsonString = messageFormatter.FormatMessage(new Error('Conference not found'), "", false, 0);
                    logger.debug('[DVP-MonitorRestAPI.GetCallCountForConference] - [%s] - API RESPONSE : %s', reqId, jsonString);
                    res.end(jsonString);
                }
            }

        });
    }
    catch(ex)
    {
        var jsonString = messageFormatter.FormatMessage(ex, "Error Occurred", false, -1);
        logger.debug('[DVP-MonitorRestAPI.GetCallCountForConference] - [%s] - API RESPONSE : %s', reqId, jsonString);
        res.end(jsonString);
    }

    return next();

});

var AppendConferenceCounts = function(reqId, confCountList, confName, callback)
{
    redisHandler.GetObject(reqId, 'CONFERENCE-COUNT:' + confName, function(err, redisObj)
    {
        if(redisObj)
        {
            confCountList[confName] = redisObj;
        }
        else
        {
            confCountList[confName] = 0;
        }

        callback(err, confCountList);

    });

}

var AppendConferenceUsers = function(reqId, confList, confName, confUser, callback)
{

    redisHandler.GetFromHash(reqId, 'CONFERENCE-USER:' + confUser, function(err, userDetails)
    {
        if(userDetails)
        {
            confList[confName] = {};
            confList[confName][confUser] = userDetails;
        }
        else
        {
            confList[confName] = {};
        }

        callback(err, confList);

    });

}




var AppendConferences = function(reqId, confList, confName, callback)
{
    redisHandler.GetFromSet(reqId, 'CONFERENCE-MEMBERS:' + confName, function(err, usersList)
    {
        if(usersList)
        {
            var usrCount = 0;
            var usrLimit = usersList.length;

            if(usrLimit)
            {
                for(i=0; i<usersList.length; i++)
                {

                    AppendConferenceUsers(reqId, confList, confName, usersList[i], function (err, confUsrList)
                    {
                        usrCount++;
                        if(usrCount >= usrLimit)
                        {
                            callback(null, confList);
                        }
                    });


                }
            }
            else
            {
                confList[confName] = {}
                callback(err, confList);
            }
        }
        else
        {
            confList[confName] = {};
            callback(err, confList);
        }



    });

}

server.get('/DVP/API/:version/MonitorRestAPI/Conference/Calls/Count', authorization({resource:"sysmonitoring", action:"read"}), function(req, res, next)
{
    var reqId = nodeUuid.v1();
    logger.debug('[DVP-MonitorRestAPI.GetCallsForConference] - [%s] - HTTP Request Received - params : %s', reqId);

    try
    {
        var companyId = req.user.company;
        var tenantId = req.user.tenant;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }

        dbHandler.GetConferenceListByCompany(reqId, companyId, tenantId, function(err, confList)
        {
            if(err)
            {
                var jsonString = messageFormatter.FormatMessage(err, "", false, null);
                logger.debug('[DVP-MonitorRestAPI.GetCallsForConference] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }
            else
            {
                if(confList)
                {
                    var confCounts = {};
                    var limit = confList.length;
                    var current = 0;

                    for(i=0; i<confList.length; i++)
                    {
                        AppendConferenceCounts(reqId, confCounts, confList[i].ConferenceName, function(err, newList)
                        {
                            current++;

                            if(current >= limit)
                            {
                                var jsonString = messageFormatter.FormatMessage(null, "SUCCESS", true, confCounts);
                                logger.debug('[DVP-MonitorRestAPI.GetCallsForConference] - [%s] - API RESPONSE : %s', reqId, jsonString);
                                res.end(jsonString);
                            }

                        })

                    }

                }
                else
                {
                    var jsonString = messageFormatter.FormatMessage(new Error('Conference not found'), "", false, 0);
                    logger.debug('[DVP-MonitorRestAPI.GetCallsForConference] - [%s] - API RESPONSE : %s', reqId, jsonString);
                    res.end(jsonString);
                }
            }

        });

    }
    catch(ex)
    {
        var jsonString = messageFormatter.FormatMessage(ex, "Error Occurred", false, -1);
        logger.debug('[DVP-MonitorRestAPI.GetChannelsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
        res.end(jsonString);
    }

    return next();

});

server.get('/DVP/API/:version/MonitorRestAPI/Conference/Calls', authorization({resource:"sysmonitoring", action:"read"}), function(req, res, next)
{
    var reqId = nodeUuid.v1();
    logger.debug('[DVP-MonitorRestAPI.GetCallsForConference] - [%s] - HTTP Request Received - params : %s', reqId);

    try
    {
        var companyId = req.user.company;
        var tenantId = req.user.tenant;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }

        dbHandler.GetConferenceListByCompany(reqId, companyId, tenantId, function(err, confList)
        {
            if(err)
            {
                var jsonString = messageFormatter.FormatMessage(err, "", false, null);
                logger.debug('[DVP-MonitorRestAPI.GetCallsForConference] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }
            else
            {
                if(confList)
                {
                    var confInfo = {};
                    var limit = confList.length;
                    var current = 0;

                    if(limit)
                    {
                        for(i=0; i<confList.length; i++)
                        {
                            AppendConferences(reqId, confInfo, confList[i].ConferenceName, function(err, newList)
                            {
                                current++;

                                if(current >= limit)
                                {
                                    var jsonString = messageFormatter.FormatMessage(null, "SUCCESS", true, confInfo);
                                    logger.debug('[DVP-MonitorRestAPI.GetCallsForConference] - [%s] - API RESPONSE : %s', reqId, jsonString);
                                    res.end(jsonString);
                                }

                            })

                        }
                    }
                    else
                    {
                        var jsonString = messageFormatter.FormatMessage(new Error('Conference not found'), "", false, 0);
                        logger.debug('[DVP-MonitorRestAPI.GetCallsForConference] - [%s] - API RESPONSE : %s', reqId, jsonString);
                        res.end(jsonString);
                    }



                }
                else
                {
                    var jsonString = messageFormatter.FormatMessage(new Error('Conference not found'), "", false, 0);
                    logger.debug('[DVP-MonitorRestAPI.GetCallsForConference] - [%s] - API RESPONSE : %s', reqId, jsonString);
                    res.end(jsonString);
                }
            }

        });

    }
    catch(ex)
    {
        var jsonString = messageFormatter.FormatMessage(ex, "Error Occurred", false, -1);
        logger.debug('[DVP-MonitorRestAPI.GetChannelsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
        res.end(jsonString);
    }

    return next();

});

// ---------------------- Dispatch call operations ---------------------- \\


server.post('/DVP/API/:version/MonitorRestAPI/Dispatch/:channelId/listen', authorization({resource:"Dispatch", action:"write"}), function(req, res, next)
{
    try {

        logger.info('[DVP-CallListen] - [HTTP]  - Request received -  Data - %s ', JSON.stringify(req.body));

        if (!req.user ||!req.user.tenant || !req.user.company)
            throw new Error("invalid tenant or company.");
        var cmp = req.body;
        var tenantId = req.user.tenant;
        var companyId = req.user.company;

        dispatchHandler.CallListen(tenantId, companyId,req, res);

    }
    catch (ex) {

        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
        logger.error('[DVP-CallListen] - Request response : %s ', jsonString);
        res.end(jsonString);
    }

    return next();

});

server.post('/DVP/API/:version/MonitorRestAPI/Dispatch/:channelId/barge', authorization({resource:"Dispatch", action:"write"}), function(req, res, next)
{
    try {

        logger.info('[DVP-CallBargin] - [HTTP]  - Request received -  Data - %s ', JSON.stringify(req.body));

        if (!req.user ||!req.user.tenant || !req.user.company)
            throw new Error("invalid tenant or company.");
        var cmp = req.body;
        var tenantId = req.user.tenant;
        var companyId = req.user.company;

        dispatchHandler.CallBargin(tenantId, companyId,req, res);

    }
    catch (ex) {

        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
        logger.error('[DVP-CallBargin] - Request response : %s ', jsonString);
        res.end(jsonString);
    }

    return next();

});

server.post('/DVP/API/:version/MonitorRestAPI/Dispatch/:channelId/threeway', authorization({resource:"Dispatch", action:"write"}), function(req, res, next)
{
    try {

        logger.info('[DVP-CallThreeway] - [HTTP]  - Request received -  Data - %s ', JSON.stringify(req.body));

        if (!req.user ||!req.user.tenant || !req.user.company)
            throw new Error("invalid tenant or company.");
        var cmp = req.body;
        var tenantId = req.user.tenant;
        var companyId = req.user.company;

        dispatchHandler.CallThreeway(tenantId, companyId,req, res);

    }
    catch (ex) {

        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
        logger.error('[DVP-CallThreeway] - Request response : %s ', jsonString);
        res.end(jsonString);
    }

    return next();

});

// ---------------------- Dispatch call operations ---------------------- \\


// ---------------------- Veery configuration caching ------------------- //

server.post('/DVP/API/:version/MonitorRestAPI/Caching', authorization({resource:"caching", action:"write"}), function(req, res, next)
{
    try
    {
        var cacheUpdateInfo = req.body;

        if(cacheUpdateInfo && cacheUpdateInfo.ResourceType && cacheUpdateInfo.ResourceUniqueId)
        {


        }
        else
        {
            var jsonString = messageFormatter.FormatMessage(new Error('Insufficient data'), "Insufficient data", false, false);
            logger.debug('[DVP-MonitorRestAPI.GetConferenceUsers] - API RESPONSE : %s', jsonString);
            res.end(jsonString);
        }

    }
    catch(ex)
    {
        var jsonString = messageFormatter.FormatMessage(ex, "ERROR OCCURRED", false, false);
        logger.debug('[DVP-MonitorRestAPI.GetConferenceUsers] - API RESPONSE : %s', jsonString);
        res.end(jsonString);
    }
});


function Crossdomain(req,res,next){


    var xml='<?xml version=""1.0""?><!DOCTYPE cross-domain-policy SYSTEM ""http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd""> <cross-domain-policy>    <allow-access-from domain=""*"" />        </cross-domain-policy>';

    var xml='<?xml version="1.0"?>\n';

    xml+= '<!DOCTYPE cross-domain-policy SYSTEM "/xml/dtds/cross-domain-policy.dtd">\n';
    xml+='';
    xml+=' \n';
    xml+='\n';
    xml+='';
    req.setEncoding('utf8');
    res.end(xml);

}

function Clientaccesspolicy(req,res,next){


    var xml='<?xml version="1.0" encoding="utf-8" ?>       <access-policy>        <cross-domain-access>        <policy>        <allow-from http-request-headers="*">        <domain uri="*"/>        </allow-from>        <grant-to>        <resource include-subpaths="true" path="/"/>        </grant-to>        </policy>        </cross-domain-access>        </access-policy>';
    req.setEncoding('utf8');
    res.end(xml);

}

server.get("/crossdomain.xml",Crossdomain);
server.get("/clientaccesspolicy.xml",Clientaccesspolicy);

server.listen(hostPort, hostIp, function () {
    console.log('%s listening at %s', server.name, server.url);
});
