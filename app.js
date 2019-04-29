var restify = require('restify');
var stringify = require('stringify');
var moment = require('moment');
var config = require('config');
var dbHandler = require('./DBBackendHandler.js');
var dispatchHandler = require('./DispatchHandler');
var redisHandler = require('./RedisHandler.js');
var campRedisHandler = require('./CampaignRedisOps.js');
var messageFormatter = require('dvp-common/CommonMessageGenerator/ClientMessageJsonFormatter.js');
var nodeUuid = require('node-uuid');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;
var jwt = require('restify-jwt');
var secret = require('dvp-common/Authentication/Secret.js');
var authorization = require('dvp-common/Authentication/Authorization.js');
var redisCacheHandler = require('dvp-common/CSConfigRedisCaching/RedisHandler.js');

var hostIp = config.Host.Ip;
var hostPort = config.Host.Port;
var hostVersion = config.Host.Version;


var server = restify.createServer({
    name: 'localhost',
    version: '1.0.0'
});



//server.use(restify.CORS());
//server.use(restify.fullResponse());
//server.pre(restify.pre.userAgentConnection());
//
//
//restify.CORS.ALLOW_HEADERS.push('authorization');
//
//server.use(restify.acceptParser(server.acceptable));
//server.use(restify.queryParser());
//server.use(restify.bodyParser());
//server.use(jwt({secret: secret.Secret}));


restify.CORS.ALLOW_HEADERS.push('authorization');
server.use(restify.CORS());
server.use(restify.fullResponse());
server.use(restify.acceptParser(server.acceptable));
server.use(restify.queryParser());
server.use(restify.bodyParser());
//server.use(restify.urlEncodedBodyParser());

server.use(jwt({secret: secret.Secret,
    getToken: function fromHeaderOrQuerystring (req) {
        if (req.headers.authorization && req.headers.authorization.split(' ')[0].toLowerCase() === 'bearer') {
            return req.headers.authorization.split(' ')[1];
        } else if (req.params && req.params.Authorization) {
            return req.params.Authorization;
        }
        return null;
    }}));



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
                                var key = hash['Unique-ID'];
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
                    //var channelData =
                    //{
                    //    ChannelState: hashObj["Channel-State"],
                    //    FreeSwitchName: hashObj["FreeSWITCH-Switchname"],
                    //    ChannelName: hashObj["Channel-Name"],
                    //    CallDirection: hashObj["Call-Direction"],
                    //    CallerDestinationNumber : hashObj["Caller-Destination-Number"],
                    //    OtherLegUuid : hashObj["Other-Leg-Unique-ID"],
                    //    CallType : hashObj["Call-Type"]
                    //};

                    if(hashObj)
                    {
                        chanList.push(hashObj);
                    }

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
            confList[confName].push(userDetails);
        }

        callback(err, confList);

    });

}

var AppendConferenceUsersToUsersList = function(reqId, usrList, confName, confUser, callback)
{

    redisHandler.GetFromHash(reqId, 'CONFERENCE-USER:' + confUser, function(err, userDetails)
    {
        if(userDetails)
        {
            usrList.push(userDetails);
        }

        callback(err, usrList);

    });

}

var AppendConferenceUserListOnly = function(reqId, usrList, confName, callback)
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

                    AppendConferenceUsersToUsersList(reqId, usrList, confName, usersList[i], function (err, confUsrList)
                    {
                        usrCount++;
                        if(usrCount >= usrLimit)
                        {
                            callback(null, usrList);
                        }
                    });


                }
            }
            else
            {
                callback(err, usrList);
            }
        }
        else
        {
            callback(err, usrList);
        }



    });
}




var AppendConferences = function(reqId, confList, confName, callback)
{

    redisHandler.GetFromSet(reqId, 'CONFERENCE-MEMBERS:' + confName, function(err, usersList)
    {
        confList[confName] = [];
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

server.get('/DVP/API/:version/MonitorRestAPI/TrunkMonitoring/Trunks', authorization({resource:"tenant", action:"read"}), function(req, res, next)
{
    var reqId = nodeUuid.v1();
    var emptyList = [];
    var jsonString = '';
    try
    {
        var companyId = req.user.company;
        var tenantId = req.user.tenant;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }

        logger.debug('[DVP-MonitorRestAPI.TrunkMonitoring.Trunks] - [%s] - HTTP Request Received', reqId);

        redisHandler.GetKeys(reqId, 'TRUNK_AVAILABILITY:*', function(err, trunks)
        {
            if(trunks && trunks.length > 0)
            {
                //get all user hash sets from redis

                redisHandler.MGetObjects(reqId, trunks, function(err, trList)
                {
                    if(err)
                    {
                        jsonString = messageFormatter.FormatMessage(err, "Error occurred while getting trunks", false, emptyList);
                        logger.debug('[DVP-MonitorRestAPI.GetSipRegDetailsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
                        res.end(jsonString);
                    }
                    else
                    {
                        var arr = [];

                        trList.forEach(function(tr)
                        {
                            arr.push(JSON.parse(tr));
                        })
                        jsonString = messageFormatter.FormatMessage(null, 'Operation Successfull', true, arr);
                        logger.debug('[DVP-MonitorRestAPI.GetSipRegDetailsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
                        res.end(jsonString);
                    }
                });

            }
            else
            {
                if(err)
                {
                    logger.error('[DVP-MonitorRestAPI.GetSipRegDetailsByCompany] - [%s] - Error occurred while getting trunks', reqId, err);
                    jsonString = messageFormatter.FormatMessage(err, "Error occurred", false, emptyList);
                }
                else
                {
                    logger.warn('[DVP-MonitorRestAPI.GetSipRegDetailsByCompany] - [%s] - No trunks found on redis for monitoring', reqId);
                    jsonString = messageFormatter.FormatMessage(null, "Operation Success", true, emptyList);
                }

                res.end(jsonString);
            }
        });
    }
    catch(ex)
    {
        jsonString = messageFormatter.FormatMessage(ex, "Error", false, emptyList);
        logger.error('[DVP-MonitorRestAPI.GetSipRegDetailsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
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

        var direction = req.query.direction;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }

        var callCountKey = 'DVP_CALL_COUNT_COMPANY:' + tenantId + ':' + companyId;

        if(direction)
        {
            callCountKey = 'DVP_CALL_COUNT_COMPANY_DIR:' + tenantId + ':' + companyId + ':' + direction;
        }

        logger.debug('[DVP-MonitorRestAPI.GetCallsCount] - [%s] - Trying to get calls count object from redis - Key : %s', reqId, callCountKey);
        redisHandler.GetObject(reqId, callCountKey, function (err, callCount)
        {
            if (err)
            {
                logger.error('[DVP-MonitorRestAPI.GetCallsCount] - [%s] - Exception thrown from method redisHandler.GetObject', reqId, err);
                var jsonString = messageFormatter.FormatMessage(err, "", false, "0");
                logger.debug('[DVP-MonitorRestAPI.GetCallsCount] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }
            else
            {

                var jsonString = messageFormatter.FormatMessage(null, "Operation Successfull", true, callCount);
                if(!callCount)
                {
                    jsonString = messageFormatter.FormatMessage(null, "Operation Successfull", true, "0");
                }

                logger.debug('[DVP-MonitorRestAPI.GetCallsCount] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }


        });
    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.GetCallsCount] - [%s] - Exception occurred', reqId, ex);
        var jsonString = messageFormatter.FormatMessage(ex, "", false, "0");
        logger.debug('[DVP-MonitorRestAPI.GetCallsCount] - [%s] - API RESPONSE : %s', reqId, jsonString);
        res.end(jsonString);
    }

    return next();

});

server.post('/DVP/API/:version/MonitorRestAPI/TenantCalls/Count', authorization({resource:"tenantmonitoring", action:"read"}), function(req, res, next)
{
    var reqId = nodeUuid.v1();
    var emptyArr = [];
    try
    {
        logger.debug('[DVP-MonitorRestAPI.GetTenantCallsCount] - [%s] - HTTP Request Received', reqId);

        var companyId = req.user.company;
        var tenantId = req.user.tenant;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }

        var companyIds = req.body;

        var keys = [];

        if(Array.isArray(companyIds))
        {
            companyIds.forEach(function(compId)
            {
                keys.push('DVP_CALL_COUNT_COMPANY_DIR:' + tenantId + ':' + compId + ':inbound', 'DVP_CALL_COUNT_COMPANY_DIR:' + tenantId + ':' + compId + ':outbound');
            });

            redisHandler.MGetObjects(reqId, keys, function(err, result)
            {
                var newArr = companyIds.map(function(comp, index)
                {
                    return {
                        CompanyId: comp,
                        InboundCount: result[index * 2],
                        OutboundCount: result[(index * 2) + 1]
                    };
                });

                var jsonString = messageFormatter.FormatMessage(null, "Operation Success", true, newArr);

                logger.debug('[DVP-MonitorRestAPI.GetCallsCount] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            })
        }


    }
    catch(ex)
    {
        var jsonString = messageFormatter.FormatMessage(ex, "Exception occurred", false, emptyArr);
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
                var jsonString = messageFormatter.FormatMessage(err, "", false, "0");
                logger.debug('[DVP-MonitorRestAPI.GetChannelsCount] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }
            else
            {
                var jsonString = messageFormatter.FormatMessage(null, "Operation Successfull", true, callCount);
                if(!callCount)
                {
                    jsonString = messageFormatter.FormatMessage(null, "Operation Successfull", true, "0");
                }

                logger.debug('[DVP-MonitorRestAPI.GetChannelsCount] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }


        });
    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.GetChannelsCount] - [%s] - Exception occurred', reqId, ex);
        var jsonString = messageFormatter.FormatMessage(ex, "", false, "0");
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
                /*var channelData =
                {
                    ChannelState: hashObj["Channel-State"],
                    FreeSwitchName: hashObj["FreeSWITCH-Switchname"],
                    ChannelName: hashObj["Channel-Name"],
                    CallDirection: hashObj["Call-Direction"],
                    CallerDestinationNumber : hashObj["Caller-Destination-Number"],
                    OtherLegUuid : hashObj["Other-Leg-Unique-ID"],
                    CallType : hashObj["Call-Type"]
                };*/

                var jsonString = messageFormatter.FormatMessage(null, "Operation Successfull", true, hashObj);
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

server.post('/DVP/API/:version/MonitorRestAPI/ChannelsWithUuids', authorization({resource:"sysmonitoring", action:"read"}), function(req, res, next)
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

        var chanTags = req.body;

        logger.debug('[DVP-MonitorRestAPI.GetChannelsByCompany] - [%s] - HTTP Request Received GetChannelsByIdList', reqId);

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
            var jsonString = messageFormatter.FormatMessage(null, "Operation Successfull", true, chanList);
            logger.debug('[DVP-MonitorRestAPI.GetChannelsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
            res.end(jsonString);
        }
    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.GetChannelsByCompany] - [%s] - Exception occurred', reqId, ex);
        var jsonString = messageFormatter.FormatMessage(ex, "Error occurred", false, chanList);
        logger.debug('[DVP-MonitorRestAPI.GetChannelsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
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

            //hashList = {"975509c0-32de-11e6-9ab6-a3fd683ee773":{"Channel-State":"CS_EXECUTE","Unique-ID":"975509c0-32de-11e6-9ab6-a3fd683ee773","FreeSWITCH-Switchname":"1","Channel-Name":"sofia/internal/charlie@df7jal23ls0d.invalid","Call-Direction":"outbound","Caller-Destination-Number":"charlie","Caller-Unique-ID":"975509c0-32de-11e6-9ab6-a3fd683ee773","variable_sip_auth_realm":"null","variable_dvp_app_id":"null","Caller-Caller-ID-Number":"59429dbb-0c36-4e49-9390-2fc6b416b44a","Channel-Create-Time":"","Other-Leg-Unique-ID":"59429dbb-0c36-4e49-9390-2fc6b416b44a","Channel-Call-State":"ACTIVE"},"59429dbb-0c36-4e49-9390-2fc6b416b44a":{"Channel-State":"CS_EXCHANGE_MEDIA","Unique-ID":"59429dbb-0c36-4e49-9390-2fc6b416b44a","FreeSWITCH-Switchname":"1","Channel-Name":"sofia/internal/bob@124.43.65.63:32940","Call-Direction":"outbound","Caller-Destination-Number":"bob","Caller-Unique-ID":"59429dbb-0c36-4e49-9390-2fc6b416b44a","variable_sip_auth_realm":"null","variable_dvp_app_id":"null","Caller-Caller-ID-Number":"18705056540","Channel-Create-Time":"2016-06-15T09:50:07.000Z","Channel-Call-State":"ACTIVE"},"7349e7ca-b88b-4821-8b19-0bdae0e6d5a1":{"Channel-State":"CS_SOFT_EXECUTE","Unique-ID":"7349e7ca-b88b-4821-8b19-0bdae0e6d5a1","FreeSWITCH-Switchname":"1","Channel-Name":"sofia/external/18705056540@45.55.184.114","Call-Direction":"inbound","Caller-Destination-Number":"94777400400","Caller-Unique-ID":"7349e7ca-b88b-4821-8b19-0bdae0e6d5a1","variable_sip_auth_realm":"null","variable_dvp_app_id":"null","Caller-Caller-ID-Number":"18705056540","Channel-Create-Time":"","Channel-Call-State":"ACTIVE","Application-Type":"HTTAPI","DVP-Call-Direction":"inbound","Bridge-State":"Bridged","Other-Leg-Unique-ID":"59429dbb-0c36-4e49-9390-2fc6b416b44a"}};

            var usedChanList = {};
            var otherLegChanList = {};


            //// ALGORITHM ////

            //Call List : Main Call Structure
            //Other Leg List : OtherLeg as key and Mapping to Main Leg as ARRAY of Main Leg ID's
            //Used Leg List : Leg as key and Main call struct key as value

            try
            {
                for(var key in hashList)
                {
                    if(!usedChanList[key])
                    {

                        //NEW CHANNEL
                        var callChannels = [];
                        var otherLegUuid = hashList[key]['Other-Leg-Unique-ID'];
                        if(!otherLegUuid)
                        {
                            //CHANNEL HAS NO OTHER LEG

                            var otherLegArr = otherLegChanList[key];

                            if(otherLegArr && otherLegArr.length > 0)
                            {
                                //A PREVIOUS LEG IS IN MAIN LIST AND IT HAS TAGGED THIS LEG AS ITS OTHER LEG
                                var callListKey = usedChanList[otherLegArr[0]];
                                if(callListKey)
                                {
                                    //GETTING MAIN LIST ID FROM THE PREVIOUS LEG WHICH HAS TAGGED THIS LEG AS ITS OTHER LEG - TO PUSH THIS LEG AT THE CORRECT INDEX
                                    if (hashList[key]['CHANNEL-BRIDGE-TIME']) {
                                        var a = moment();
                                        var b = moment(hashList[key]['CHANNEL-BRIDGE-TIME']);
                                        var duration = moment.duration(a.diff(b));

                                        hashList[key]['BRIDGE-DURATION'] = duration.hours() + 'h ' + duration.minutes() + 'm ' + duration.seconds() + 's';
                                    }

                                    calls[callListKey].push(hashList[key]);
                                    usedChanList[key] = callListKey;
                                }
                            }
                            else
                            {
                                //TOTALLY NEW LEG WITH NO OTHER LEG - ADDED AS THE FIRST ITEM IN MAIN LIST

                                if (hashList[key]['CHANNEL-BRIDGE-TIME']) {
                                    var a = moment();
                                    var b = moment(hashList[key]['CHANNEL-BRIDGE-TIME']);
                                    var duration = moment.duration(a.diff(b));

                                    hashList[key]['BRIDGE-DURATION'] = duration.hours() + 'h ' + duration.minutes() + 'm ' + duration.seconds() + 's';
                                }

                                callChannels.push(hashList[key]);

                                calls[key] = callChannels;

                                usedChanList[key] = key;
                            }

                            //

                        }
                        else
                        {
                            //OTHER LEG IS PRESENT FOR THIS LEG

                            if(usedChanList[otherLegUuid])
                            {
                                //OTHER LEG OF THIS LEG HAS ALREADY BEEN PROCESSED THEREFORE NEED TO ADD THIS TO THE CORRECT POSITION IN MAIN LIST
                                var chanListId = usedChanList[otherLegUuid];

                                if (hashList[key]['CHANNEL-BRIDGE-TIME']) {
                                    var a = moment();
                                    var b = moment(hashList[key]['CHANNEL-BRIDGE-TIME']);
                                    var duration = moment.duration(a.diff(b));

                                    hashList[key]['BRIDGE-DURATION'] = duration.hours() + 'h ' + duration.minutes() + 'm ' + duration.seconds() + 's';
                                }

                                calls[chanListId].push(hashList[key]);

                                usedChanList[key] = chanListId;

                                //NEED TO MAP TO OTHER LEG LIST

                                var mainLegIdListForOtherLeg = otherLegChanList[otherLegUuid];

                                if(mainLegIdListForOtherLeg)
                                {
                                    //ADD TO ARRAY
                                    otherLegChanList[otherLegUuid].push(key);

                                }
                                else
                                {
                                    //CREATE ARRAY AND ADD
                                    otherLegChanList[otherLegUuid] = [];
                                    otherLegChanList[otherLegUuid].push(key);
                                }

                            }
                            else
                            {
                                var mainLegIdListForOtherLeg = otherLegChanList[otherLegUuid];

                                if(mainLegIdListForOtherLeg && mainLegIdListForOtherLeg.length > 0)
                                {
                                    //ANOTHER LEG HAS ADDED THIS LEG'S OTHER LEG ID AS ITS OTHER LEG ID TOO, MAIN LEG HASN'T PROCESSED YET - STILL HAVE TO GROUP THE TWO LEGS TOGETHER

                                    var chanListId = otherLegChanList[otherLegUuid][0];

                                    var mainListKey = usedChanList[chanListId];

                                    if (hashList[key]['CHANNEL-BRIDGE-TIME']) {
                                        var a = moment();
                                        var b = moment(hashList[key]['CHANNEL-BRIDGE-TIME']);
                                        var duration = moment.duration(a.diff(b));

                                        hashList[key]['BRIDGE-DURATION'] = duration.hours() + 'h ' + duration.minutes() + 'm ' + duration.seconds() + 's';
                                    }

                                    calls[mainListKey].push(hashList[key]);

                                    otherLegChanList[otherLegUuid].push(key);
                                }
                                else
                                {
                                    if(otherLegChanList[key] && otherLegChanList[key].length > 0)
                                    {
                                        if (hashList[key]['CHANNEL-BRIDGE-TIME']) {
                                            var a = moment();
                                            var b = moment(hashList[key]['CHANNEL-BRIDGE-TIME']);
                                            var duration = moment.duration(a.diff(b));

                                            hashList[key]['BRIDGE-DURATION'] = duration.hours() + 'h ' + duration.minutes() + 'm ' + duration.seconds() + 's';
                                        }
                                        calls[otherLegChanList[key][0]].push(hashList[key]);
                                    }
                                    else
                                    {
                                        //TOTALLY NEW LEG WITH NO OTHER LEG - ADDED AS THE FIRST ITEM IN MAIN LIST
                                        if (hashList[key]['CHANNEL-BRIDGE-TIME']) {
                                            var a = moment();
                                            var b = moment(hashList[key]['CHANNEL-BRIDGE-TIME']);
                                            var duration = moment.duration(a.diff(b));

                                            hashList[key]['BRIDGE-DURATION'] = duration.hours() + 'h ' + duration.minutes() + 'm ' + duration.seconds() + 's';
                                        }

                                        callChannels.push(hashList[key]);
                                        usedChanList[key] = key;
                                        calls[key] = callChannels;


                                        otherLegChanList[otherLegUuid] = [];
                                        otherLegChanList[otherLegUuid].push(key);
                                    }


                                }

                            }
                        }
                    }

                }
            }
            catch(ex)
            {

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
                            var resCount = 0;
                            if(redisResp)
                            {
                                resCount = parseInt(redisResp);
                            }
                            var jsonString = messageFormatter.FormatMessage(null, "Success", true, resCount);
                            logger.debug('[DVP-MonitorRestAPI.GetCallCountForConference] - [%s] - API RESPONSE : %s', reqId, jsonString);
                            res.end(jsonString);
                        }
                    });

                }
                else
                {
                    var jsonString = messageFormatter.FormatMessage(null, "Conference Not Found", true, 0);
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

server.get('/DVP/API/:version/MonitorRestAPI/Conference/:confName/RealTimeUsers', authorization({resource:"sysmonitoring", action:"read"}), function(req, res, next)
{
    var reqId = nodeUuid.v1();
    logger.debug('[DVP-MonitorRestAPI.GetCallsForConference] - [%s] - HTTP Request Received - params : %s', reqId);

    try
    {
        var companyId = req.user.company;
        var tenantId = req.user.tenant;
        var confName = req.params.confName;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }

        var usrArr = [];

        AppendConferenceUserListOnly(reqId, usrArr, confName, function(err, newList)
        {
            var jsonString = messageFormatter.FormatMessage(null, "SUCCESS", true, usrArr);
            logger.debug('[DVP-MonitorRestAPI.GetCallsForConference] - [%s] - API RESPONSE : %s', reqId, jsonString);
            res.end(jsonString);

        })

    }
    catch(ex)
    {
        var jsonString = messageFormatter.FormatMessage(ex, "Error Occurred", false, usrArr);
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


server.post('/DVP/API/:version/MonitorRestAPI/Dispatch/:channelId/returnlisten/:legId', authorization({resource:"Dispatch", action:"write"}), function(req, res, next)
{
    try {

        logger.info('[DVP-CallDisconnect] - [HTTP]  - Request received');

        if (!req.user ||!req.user.tenant || !req.user.company)
            throw new Error("invalid tenant or company.");

        var tenantId = req.user.tenant;
        var companyId = req.user.company;
        var legId = req.params.legId;
        var reqId = nodeUuid.v1();
        var channelId = req.params.channelId;

        dispatchHandler.simulateDtmf(reqId, channelId, companyId, tenantId,legId,'0')
            .then(function(resp)
            {
                if(resp)
                {
                    var jsonString = messageFormatter.FormatMessage(null, "SUCCESS", true, resp);
                    logger.debug('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                    res.end(jsonString);
                }
                else
                {
                    var jsonString = messageFormatter.FormatMessage(new Error('Call Disconnect Error'), "ERROR", false, resp);
                    logger.debug('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                    res.end(jsonString);
                }
            })
            .catch(function(err)
            {
                var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, false);
                logger.error('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                res.end(jsonString);
            });

    }
    catch (ex) {

        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, false);
        logger.error('[DVP-CallDisconnect] - Request response : %s ', jsonString);
        res.end(jsonString);
    }

    return next();

});


server.post('/DVP/API/:version/MonitorRestAPI/Dispatch/:channelId/swap/:legId', authorization({resource:"Dispatch", action:"write"}), function(req, res, next)
{
    try {

        logger.info('[DVP-CallDisconnect] - [HTTP]  - Request received');

        if (!req.user ||!req.user.tenant || !req.user.company)
            throw new Error("invalid tenant or company.");

        var tenantId = req.user.tenant;
        var companyId = req.user.company;
        var legId = req.params.legId;
        var reqId = nodeUuid.v1();
        var channelId = req.params.channelId;

        dispatchHandler.simulateDtmf(reqId, channelId, companyId, tenantId,legId,'1')
            .then(function(resp)
            {
                if(resp)
                {
                    var jsonString = messageFormatter.FormatMessage(null, "SUCCESS", true, resp);
                    logger.debug('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                    res.end(jsonString);
                }
                else
                {
                    var jsonString = messageFormatter.FormatMessage(new Error('Call Disconnect Error'), "ERROR", false, resp);
                    logger.debug('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                    res.end(jsonString);
                }
            })
            .catch(function(err)
            {
                var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, false);
                logger.error('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                res.end(jsonString);
            });

    }
    catch (ex) {

        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, false);
        logger.error('[DVP-CallDisconnect] - Request response : %s ', jsonString);
        res.end(jsonString);
    }

    return next();

});

server.post('/DVP/API/:version/MonitorRestAPI/Dispatch/:channelId/barge/:legId', authorization({resource:"Dispatch", action:"write"}), function(req, res, next)
{
    try {

        logger.info('[DVP-CallDisconnect] - [HTTP]  - Request received');

        if (!req.user ||!req.user.tenant || !req.user.company)
            throw new Error("invalid tenant or company.");

        var tenantId = req.user.tenant;
        var companyId = req.user.company;

        var reqId = nodeUuid.v1();
        var channelId = req.params.channelId;
        var legId = req.params.legId;

        dispatchHandler.simulateDtmf(reqId, channelId, companyId, tenantId,legId,'2')
            .then(function(resp)
            {
                if(resp)
                {
                    var jsonString = messageFormatter.FormatMessage(null, "SUCCESS", true, resp);
                    logger.debug('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                    res.end(jsonString);
                }
                else
                {
                    var jsonString = messageFormatter.FormatMessage(new Error('Call Disconnect Error'), "ERROR", false, resp);
                    logger.debug('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                    res.end(jsonString);
                }
            })
            .catch(function(err)
            {
                var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, false);
                logger.error('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                res.end(jsonString);
            });

    }
    catch (ex) {

        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, false);
        logger.error('[DVP-CallDisconnect] - Request response : %s ', jsonString);
        res.end(jsonString);
    }

    return next();
});

server.post('/DVP/API/:version/MonitorRestAPI/Dispatch/:channelId/threeway/:legId', authorization({resource:"Dispatch", action:"write"}), function(req, res, next)
{
    try {

        logger.info('[DVP-CallDisconnect] - [HTTP]  - Request received');

        if (!req.user ||!req.user.tenant || !req.user.company)
            throw new Error("invalid tenant or company.");

        var tenantId = req.user.tenant;
        var companyId = req.user.company;
        var legId = req.params.legId;

        var reqId = nodeUuid.v1();
        var channelId = req.params.channelId;

        dispatchHandler.simulateDtmf(reqId, channelId, companyId, tenantId,legId,'3')
            .then(function(resp)
            {
                if(resp)
                {
                    var jsonString = messageFormatter.FormatMessage(null, "SUCCESS", true, resp);
                    logger.debug('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                    res.end(jsonString);
                }
                else
                {
                    var jsonString = messageFormatter.FormatMessage(new Error('Call Disconnect Error'), "ERROR", false, resp);
                    logger.debug('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                    res.end(jsonString);
                }
            })
            .catch(function(err)
            {
                var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, false);
                logger.error('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                res.end(jsonString);
            });

    }
    catch (ex) {

        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, false);
        logger.error('[DVP-CallDisconnect] - Request response : %s ', jsonString);
        res.end(jsonString);
    }

    return next();

});

server.post('/DVP/API/:version/MonitorRestAPI/Dispatch/:channelId/disconnect', authorization({resource:"Dispatch", action:"write"}), function(req, res, next)
{
    try {

        logger.info('[DVP-CallDisconnect] - [HTTP]  - Request received');

        if (!req.user ||!req.user.tenant || !req.user.company)
            throw new Error("invalid tenant or company.");

        var tenantId = req.user.tenant;
        var companyId = req.user.company;

        var reqId = nodeUuid.v1();
        var channelId = req.params.channelId;

        dispatchHandler.callDisconnect(reqId, channelId, companyId, tenantId)
            .then(function(resp)
            {
                if(resp)
                {
                    var jsonString = messageFormatter.FormatMessage(null, "SUCCESS", true, resp);
                    logger.debug('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                    res.end(jsonString);
                }
                else
                {
                    var jsonString = messageFormatter.FormatMessage(new Error('Call Disconnect Error'), "ERROR", false, resp);
                    logger.debug('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                    res.end(jsonString);
                }
            })
            .catch(function(err)
            {
                var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, false);
                logger.error('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                res.end(jsonString);
            });

    }
    catch (ex) {

        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, false);
        logger.error('[DVP-CallDisconnect] - Request response : %s ', jsonString);
        res.end(jsonString);
    }

    return next();

});


server.post('/DVP/API/:version/MonitorRestAPI/Direct/hungup', authorization({resource:"Dispatch", action:"write"}), function(req, res, next)
{
    try {

        logger.info('[DVP-CallDisconnect] - [HTTP]  - Request received');

        if (!req.user ||!req.user.tenant || !req.user.company)
            throw new Error("invalid tenant or company.");

        var tenantId = req.user.tenant;
        var companyId = req.user.company;

        var reqId = nodeUuid.v1();
        var channelId = req.params.callrefid;

        dispatchHandler.callDisconnect(reqId, channelId, companyId, tenantId)
            .then(function(resp)
            {
                if(resp)
                {
                    var jsonString = messageFormatter.FormatMessage(null, "SUCCESS", true, resp);
                    logger.debug('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                    res.end(jsonString);
                }
                else
                {
                    var jsonString = messageFormatter.FormatMessage(new Error('Call Disconnect Error'), "ERROR", false, resp);
                    logger.debug('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                    res.end(jsonString);
                }
            })
            .catch(function(err)
            {
                var jsonString = messageFormatter.FormatMessage(err, err.message, false, false);
                logger.error('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                res.end(jsonString);
            });

    }
    catch (ex) {

        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, false);
        logger.error('[DVP-CallDisconnect] - Request response : %s ', jsonString);
        res.end(jsonString);
    }

    return next();

});

server.post('/DVP/API/:version/MonitorRestAPI/Direct/hold/:hold', authorization({resource:"Dispatch", action:"write"}), function(req, res, next)
{
    try {

        logger.info('[DVP-CallDisconnect] - [HTTP]  - Request received');

        if (!req.user ||!req.user.tenant || !req.user.company)
            throw new Error("invalid tenant or company.");

        var tenantId = req.user.tenant;
        var companyId = req.user.company;

        var reqId = nodeUuid.v1();
        var channelId = req.params.callrefid;

        req.params.hold = (req.params.hold == 'true');

        dispatchHandler.callHold(reqId, channelId, companyId, tenantId,req.params.hold)
            .then(function(resp)
            {
                if(resp)
                {
                    var jsonString = messageFormatter.FormatMessage(null, "SUCCESS", true, resp);
                    logger.debug('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                    res.end(jsonString);
                }
                else
                {
                    var jsonString = messageFormatter.FormatMessage(new Error('Call Disconnect Error'), "ERROR", false, resp);
                    logger.debug('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                    res.end(jsonString);
                }
            })
            .catch(function(err)
            {
                var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, false);
                logger.error('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                res.end(jsonString);
            });

    }
    catch (ex) {

        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, false);
        logger.error('[DVP-CallDisconnect] - Request response : %s ', jsonString);
        res.end(jsonString);
    }

    return next();

});

server.post('/DVP/API/:version/MonitorRestAPI/Direct/mute/:mute', authorization({resource:"Dispatch", action:"write"}), function(req, res, next)
{
    try {

        logger.info('[DVP-CallDisconnect] - [HTTP]  - Request received');

        if (!req.user ||!req.user.tenant || !req.user.company)
            throw new Error("invalid tenant or company.");

        var tenantId = req.user.tenant;
        var companyId = req.user.company;

        var reqId = nodeUuid.v1();
        var channelId = req.params.callrefid;


        req.params.mute = (req.params.mute == 'true');

        dispatchHandler.callMute(reqId, channelId, companyId, tenantId,req.params.mute)
            .then(function(resp)
            {
                if(resp)
                {
                    var jsonString = messageFormatter.FormatMessage(null, "SUCCESS", true, resp);
                    logger.debug('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                    res.end(jsonString);
                }
                else
                {
                    var jsonString = messageFormatter.FormatMessage(new Error('Call Disconnect Error'), "ERROR", false, resp);
                    logger.debug('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                    res.end(jsonString);
                }
            })
            .catch(function(err)
            {
                var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, false);
                logger.error('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                res.end(jsonString);
            });

    }
    catch (ex) {

        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, false);
        logger.error('[DVP-CallDisconnect] - Request response : %s ', jsonString);
        res.end(jsonString);
    }

    return next();

});

server.post('/DVP/API/:version/MonitorRestAPI/Direct/dtmf', authorization({resource:"Dispatch", action:"write"}), function(req, res, next)
{
    try {

        logger.info('[DVP-CallDisconnect] - [HTTP]  - Request received');

        if (!req.user ||!req.user.tenant || !req.user.company)
            throw new Error("invalid tenant or company.");

        var tenantId = req.user.tenant;
        var companyId = req.user.company;

        var reqId = nodeUuid.v1();
        var channelId = req.params.callrefid;

        dispatchHandler.sendDtmf(reqId, channelId, companyId, tenantId,req.params.digit)
            .then(function(resp)
            {
                if(resp)
                {
                    var jsonString = messageFormatter.FormatMessage(null, "SUCCESS", true, resp);
                    logger.debug('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                    res.end(jsonString);
                }
                else
                {
                    var jsonString = messageFormatter.FormatMessage(new Error('Call Disconnect Error'), "ERROR", false, resp);
                    logger.debug('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                    res.end(jsonString);
                }
            })
            .catch(function(err)
            {
                var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, false);
                logger.error('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                res.end(jsonString);
            });

    }
    catch (ex) {

        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, false);
        logger.error('[DVP-CallDisconnect] - Request response : %s ', jsonString);
        res.end(jsonString);
    }

    return next();

});

server.post('/DVP/API/:version/MonitorRestAPI/Direct/answer', authorization({resource:"Dispatch", action:"write"}), function(req, res, next)
{
    try {

        logger.info('[DVP-CallDisconnect] - [HTTP]  - Request received');

        if (!req.user ||!req.user.tenant || !req.user.company)
            throw new Error("invalid tenant or company.");

        var tenantId = req.user.tenant;
        var companyId = req.user.company;

        var reqId = nodeUuid.v1();
        var channelId = req.params.channelId;

        dispatchHandler.sendMessage(reqId, channelId, companyId, tenantId,"force_answer")
            .then(function(resp)
            {
                if(resp)
                {
                    var jsonString = messageFormatter.FormatMessage(null, "SUCCESS", true, resp);
                    logger.debug('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                    res.end(jsonString);
                }
                else
                {
                    var jsonString = messageFormatter.FormatMessage(new Error('Call Disconnect Error'), "ERROR", false, resp);
                    logger.debug('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                    res.end(jsonString);
                }
            })
            .catch(function(err)
            {
                var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, false);
                logger.error('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                res.end(jsonString);
            });

    }
    catch (ex) {

        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, false);
        logger.error('[DVP-CallDisconnect] - Request response : %s ', jsonString);
        res.end(jsonString);
    }

    return next();

});

server.post('/DVP/API/:version/MonitorRestAPI/Direct/simulatedtmf', authorization({resource:"Dispatch", action:"write"}), function(req, res, next)
{
    try {

        logger.info('[DVP-CallDisconnect] - [HTTP]  - Request received');

        if (!req.user ||!req.user.tenant || !req.user.company)
            throw new Error("invalid tenant or company.");

        var tenantId = req.user.tenant;
        var companyId = req.user.company;

        var reqId = nodeUuid.v1();
        var channelId = req.params.callrefid;
        var legId = req.params.legId;
        var digits = req.params.digit;

        dispatchHandler.simulateDtmf(reqId, channelId, companyId, tenantId, legId,digits)
            .then(function(resp)
            {
                if(resp)
                {
                    var jsonString = messageFormatter.FormatMessage(null, "SUCCESS", true, resp);
                    logger.debug('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                    res.end(jsonString);
                }
                else
                {
                    var jsonString = messageFormatter.FormatMessage(new Error('Call Disconnect Error'), "ERROR", false, resp);
                    logger.debug('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                    res.end(jsonString);
                }
            })
            .catch(function(err)
            {
                var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, false);
                logger.error('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                res.end(jsonString);
            });

    }
    catch (ex) {

        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, false);
        logger.error('[DVP-CallDisconnect] - Request response : %s ', jsonString);
        res.end(jsonString);
    }

    return next();

});


server.post('/DVP/API/:version/MonitorRestAPI/Direct/transfer', authorization({resource:"Dispatch", action:"write"}), function(req, res, next)
{
    try {

        logger.info('[DVP-CallDisconnect] - [HTTP]  - Request received');

        if (!req.user ||!req.user.tenant || !req.user.company)
            throw new Error("invalid tenant or company.");

        var tenantId = req.user.tenant;
        var companyId = req.user.company;

        var reqId = nodeUuid.v1();
        var channelId = req.params.callrefid;
        var legId = req.params.legId;
        var digits = req.params.number;

        dispatchHandler.transfer(reqId, channelId, companyId, tenantId, legId,digits)
            .then(function(resp)
            {
                if(resp)
                {
                    var jsonString = messageFormatter.FormatMessage(null, "SUCCESS", true, resp);
                    logger.debug('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                    res.end(jsonString);
                }
                else
                {
                    var jsonString = messageFormatter.FormatMessage(new Error('Call Disconnect Error'), "ERROR", false, resp);
                    logger.debug('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                    res.end(jsonString);
                }
            })
            .catch(function(err)
            {
                var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, false);
                logger.error('[DVP-CallDisconnect] - Request response : %s ', jsonString);
                res.end(jsonString);
            });

    }
    catch (ex) {

        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, false);
        logger.error('[DVP-CallDisconnect] - Request response : %s ', jsonString);
        res.end(jsonString);
    }

    return next();

});



//dvp-mongomodels
// ---------------------- Dispatch call operations ---------------------- \\




// Bind Resource To Veery Account

server.post('/DVP/API/:version/MonitorRestAPI/BindResourceToVeeryAccount', authorization({resource:"sysmonitoring", action:"write"}), function(req, res, next)
{

    var reqId = nodeUuid.v1();

    try
    {
        var companyId = req.user.company;
        var tenantId = req.user.tenant;
        var iss = req.user.iss;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }

        var sipUri = req.body.SipURI;
        var resourceId = req.body.ResourceId;

        logger.debug('[DVP-MonitorRestAPI.BindResourceToVeeryAccount] - [%s] - HTTP Request Received : resource : %s', reqId, resourceId);

        if(sipUri && iss && resourceId)
        {
            var sipUriSplit = sipUri.split('@');

            if(sipUriSplit.length === 2)
            {
                dbHandler.GetSipUser(reqId, sipUriSplit[0], sipUriSplit[1], companyId, tenantId, function(err, sipUser)
                {
                    if(sipUser && sipUser.ContextId)
                    {
                        //Add Object To Redis
                        var key = 'SIPUSER_RESOURCE_MAP:' + tenantId + ':' + companyId + ':' + sipUriSplit[0];

                        var obj = {
                            SipURI: sipUri,
                            Context: sipUser.ContextId,
                            Issuer : iss,
                            CompanyId : companyId,
                            TenantId : tenantId,
                            ResourceId: resourceId
                        };

                        redisHandler.SetObject(reqId, key, JSON.stringify(obj), function(err, result)
                        {
                            if(err)
                            {
                                var jsonString = messageFormatter.FormatMessage(err, "Error occurred", false, false);
                                logger.error('[DVP-MonitorRestAPI.GetChannelsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
                                res.end(jsonString);

                            }
                            else
                            {
                                var jsonString = messageFormatter.FormatMessage(null, "Success", true, true);
                                logger.debug('[DVP-MonitorRestAPI.GetChannelsByCompany] - [%s] - API RESPONSE : %s', reqId, jsonString);
                                res.end(jsonString);

                            }
                        });

                        if(sipUser.Extension && sipUser.Extension.Extension)
                        {
                            var extKey = 'EXTENSION_RESOURCE_MAP:' + tenantId + ':' + companyId + ':' + sipUser.Extension.Extension;

                            var obj = {
                                SipURI: sipUri,
                                Context: sipUser.ContextId,
                                Issuer : iss,
                                CompanyId : companyId,
                                TenantId : tenantId,
                                ResourceId: resourceId
                            };

                            redisHandler.SetObject(reqId, extKey, JSON.stringify(obj), function(err, result)
                            {
                                if(err)
                                {
                                    var jsonString = messageFormatter.FormatMessage(err, "Error occurred", false, false);
                                    logger.error('[DVP-MonitorRestAPI.BindResourceToVeeryAccount] - [%s] - API RESPONSE : %s', reqId, jsonString);
                                    res.end(jsonString);

                                }
                                else
                                {
                                    var jsonString = messageFormatter.FormatMessage(null, "Success", true, true);
                                    logger.debug('[DVP-MonitorRestAPI.BindResourceToVeeryAccount] - [%s] - API RESPONSE : %s', reqId, jsonString);
                                    res.end(jsonString);

                                }
                            })
                        }
                    }
                    else
                    {
                        var jsonString = messageFormatter.FormatMessage(new Error('Sip user or context not found'), "Sip user or context not found", false, false);
                        logger.error('[DVP-MonitorRestAPI.BindResourceToVeeryAccount] - [%s] - API RESPONSE : %s', reqId, jsonString);
                        res.end(jsonString);
                    }
                })

            }
            else
            {
                var jsonString = messageFormatter.FormatMessage(new Error('Invalid Sip URI Format'), "Invalid Sip URI Format", false, false);
                logger.error('[DVP-MonitorRestAPI.BindResourceToVeeryAccount] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }
        }
        else
        {
            var jsonString = messageFormatter.FormatMessage(new Error('Sip URI not provided'), "Sip URI not provided", false, false);
            logger.error('[DVP-MonitorRestAPI.BindResourceToVeeryAccount] - [%s] - API RESPONSE : %s', reqId, jsonString);
            res.end(jsonString);
        }
    }
    catch(ex)
    {
        var jsonString = messageFormatter.FormatMessage(ex, "Error occurred", false, false);
        logger.error('[DVP-MonitorRestAPI.BindResourceToVeeryAccount] - [%s] - API RESPONSE : %s', reqId, jsonString);
        res.end(jsonString);
    }

    return next();

});


//Campaign Data

server.get('/DVP/API/:version/MonitorRestAPI/Campaigns', authorization({resource:"sysmonitoring", action:"read"}), function(req, res, next)
{
    var reqId = nodeUuid.v1();
    var emptyArr = [];
    try
    {
        logger.debug('[DVP-MonitorRestAPI.GetCampaigns] - [%s] - HTTP Request Received', reqId);

        var companyId = req.user.company;
        var tenantId = req.user.tenant;
        var opStatus = req.query.OperationalStatus;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }

        logger.debug('[DVP-MonitorRestAPI.GetCampaigns] - [%s] - Trying to get redis hash keys for company - Company : %d, Tenant : %d', reqId, companyId, tenantId);
        var pattern = "RealTimeCampaign:" + tenantId + ":" + companyId + ":*";
        campRedisHandler.GetKeys(reqId, pattern, function (err, hashIds)
        {
            if (err)
            {
                var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, emptyArr);
                logger.debug('[DVP-MonitorRestAPI.GetCampaigns] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }
            else
            {
                campRedisHandler.MultipleHashHGetAll(reqId, hashIds, function (err, campaigns)
                {
                    if (err)
                    {
                        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, emptyArr);
                        logger.debug('[DVP-MonitorRestAPI.GetCampaigns] - [%s] - API RESPONSE : %s', reqId, jsonString);
                        res.end(jsonString);
                    }
                    else
                    {
                        var filtered = [];

                        if(campaigns.length > 0)
                        {
                            campaigns.forEach(function(campTemp)
                            {
                                filtered.push(campTemp[1])
                            })


                        }
                        
                        if(opStatus)
                        {
                            filtered = filtered.filter((item)=>{
                                return item.OperationalStatus === opStatus
                            })
                        }

                        var jsonString = messageFormatter.FormatMessage(null, "SUCCESS", true, filtered);
                        logger.debug('[DVP-MonitorRestAPI.GetCampaigns] - [%s] - API RESPONSE : %s', reqId, jsonString);
                        res.end(jsonString);
                    }

                });
            }

        });
    }
    catch(ex)
    {
        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, emptyArr);
        logger.debug('[DVP-MonitorRestAPI.GetCampaigns] - [%s] - API RESPONSE : %s', reqId, jsonString);
        res.end(jsonString);
    }

    return next();

});

server.get('/DVP/API/:version/MonitorRestAPI/Campaign/:campaignId/Calls', authorization({resource:"sysmonitoring", action:"read"}), function(req, res, next)
{
    var reqId = nodeUuid.v1();
    var emptyArr = [];
    try
    {
        logger.debug('[DVP-MonitorRestAPI.GetCampaignCalls] - [%s] - HTTP Request Received', reqId);

        var companyId = req.user.company;
        var tenantId = req.user.tenant;
        var campId = req.params.campaignId;
        var dialState = req.query.DialState;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }

        logger.debug('[DVP-MonitorRestAPI.GetCampaignCalls] - [%s] - Trying to get redis hash keys for company - Company : %d, Tenant : %d, campaignId: %d', reqId, companyId, tenantId, campId);
        var pattern = "RealTimeCampaignCalls:" + tenantId + ":" + companyId + ":" + campId + ":*";
        campRedisHandler.GetKeys(reqId, pattern, function (err, hashIds)
        {
            if (err)
            {
                var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, emptyArr);
                logger.debug('[DVP-MonitorRestAPI.GetCampaignCalls] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }
            else
            {
                campRedisHandler.MultipleHashHGetAll(reqId, hashIds, function (err, campaignsCalls)
                {
                    if (err)
                    {
                        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, emptyArr);
                        logger.debug('[DVP-MonitorRestAPI.GetCampaignCalls] - [%s] - API RESPONSE : %s', reqId, jsonString);
                        res.end(jsonString);
                    }
                    else
                    {
                        var filtered = [];

                        if(campaignsCalls.length > 0)
                        {
                            campaignsCalls.forEach(function(call)
                            {
                                filtered.push(call[1])
                            })

                        }

                        if(dialState)
                        {
                            filtered = filtered.filter((item)=>{
                                return item.DialState === dialState
                            })
                        }

                        var jsonString = messageFormatter.FormatMessage(null, "SUCCESS", true, filtered);
                        logger.debug('[DVP-MonitorRestAPI.GetCampaignCalls] - [%s] - API RESPONSE : %s', reqId, jsonString);
                        res.end(jsonString);
                    }

                });
            }

        });
    }
    catch(ex)
    {
        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, emptyArr);
        logger.debug('[DVP-MonitorRestAPI.GetCampaignCalls] - [%s] - API RESPONSE : %s', reqId, jsonString);
        res.end(jsonString);
    }

    return next();

});

////////////////////////////////////////


// ---------------------- Veery configuration caching ------------------- //

server.post('/DVP/API/:version/MonitorRestAPI/Caching', authorization({resource:"sysmonitoring", action:"write"}), function(req, res, next)
{
    try
    {
        var companyId = req.user.company;
        var tenantId = req.user.tenant;

        if (!companyId || !tenantId)
        {
            throw new Error("Invalid company or tenant");
        }

        redisCacheHandler.addDataToCache(companyId, tenantId);

        logger.debug('[DVP-MonitorRestAPI.GetConferenceUsers] - SUCCESS');
        res.end();

    }
    catch(ex)
    {
        var jsonString = messageFormatter.FormatMessage(ex, "ERROR OCCURRED", false, false);
        logger.debug('[DVP-MonitorRestAPI.GetConferenceUsers] - API RESPONSE : %s', jsonString);
        res.end(jsonString);
    }

    return next();
});

server.post('/DVP/API/:version/EventTrigger/Zapier/Call/Subscribe', function(req, res, next)
{
    try
    {
        let callEvtTestData = [{EventType:'CALL_CREATE', SessionId: 'fdsfdsfsdfsdfs'}];

        logger.debug('[DVP-EventTriggerService.ZapierCallSubscribe] - SUCCESS');
        res.end(JSON.stringify(callEvtTestData));

    }
    catch(ex)
    {
        var jsonString = messageFormatter.FormatMessage(ex, "ERROR OCCURRED", false, false);
        logger.debug('[DVP-MonitorRestAPI.GetConferenceUsers] - API RESPONSE : %s', jsonString);
        res.end(jsonString);
    }

    return next();
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
