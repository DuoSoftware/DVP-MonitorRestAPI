/**
 * Created by Rajinda on 2/26/2016.
 */

var messageFormatter = require('dvp-common/CommonMessageGenerator/ClientMessageJsonFormatter.js');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;
var config = require('config');
var redisHandler = require('./RedisHandler.js');
var dbmodel = require('dvp-dbmodels');
var request = require('request');
var format = require('stringformat');
var nodeUuid = require('node-uuid');
var util = require('util');
var Promise = require('bluebird');

var getCallServerId = function (reqId, channelId, res) {

    redisHandler.GetFromHash(reqId, channelId, function (err, hashObj) {
        if (err) {
            logger.error('[DVP-MonitorRestAPI.GetChannelById] - [%s] - Exception thrown from redisHandler.GetObject', reqId, err);
            var jsonString = messageFormatter.FormatMessage(err, "", false, undefined);
            logger.debug('[DVP-MonitorRestAPI.GetChannelById] - [%s] - API RESPONSE : %s', reqId, jsonString);
            res.end(jsonString);
        }
        else {
            if (hashObj) {
                var callServerId = hashObj["FreeSWITCH-Switchname"];
                dbmodel.CallServer.find({where: [{id: callServerId}, {Activate: true}]}).then(function (csData) {
                    if (csData) {
                        logger.debug("DVP-ClusterConfiguration.EditCallServer id %d Found", reqId);
                        var callserverIp = csData.InternalMainIP;
                        return callserverIp;
                    }
                    else {
                        var err = new Error("invalid callServerId.");
                        logger.error("DVP-GetCallServerByID id %d Failed", callServerId, err);
                        var instance = messageFormatter.FormatMessage(err, "invalid callServerId", false, undefined);
                        res.write(instance);
                        res.end();
                    }

                }).catch(function (err) {

                    logger.error("DVP-ClusterConfiguration.GetCallServerByID id %d Failed", callServerId, err);

                    var instance = messageFormatter.FormatMessage(err, "Get callserver by ID", false, undefined);
                    res.write(instance);

                    res.end();

                });
            }
            else {
                var jsonString = messageFormatter.FormatMessage(new Error("invalid channelId."), "invalid channelId", false, undefined);
                logger.debug('[DVP-MonitorRestAPI.GetChannelById] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }
        }


    });
};

var GetFullQualifiedSipUri = function (tenantId, companyId, destination, res) {

    dbmodel.Extension.find({
        where: [{Extension: destination}, {TenantId: tenantId}, {CompanyId: companyId}],
        include: [
            {model: dbmodel.SipUACEndpoint, as: "SipUACEndpoint"},
            {model: dbmodel.CloudEndUser, as: "CloudEndUser"}
        ]
    }).then(function (user) {
        if (user) {
            return user.SipUACEndpoint.SipUsername + "@" + user.CloudEndUser.Domain;
        }
        else {
            return null;
        }
    }).catch(function (err) {
        logger.error("DVP-GetFullQualifiedSipUri PGSQL %s failed", destination, err);
        res.write(messageFormatter.FormatMessage(err, "Extension NotFound or error", false, undefined));
        res.end();
    });

};

var getCallServerId = function (reqId, channelId, res) {


};

var callDisconnect = function(reqId, channelId, companyId, tenantId)
{
    return new Promise(function(fulfill, reject)
    {
        redisHandler.GetFromHash(reqId, channelId, function (err, hashObj)
        {
            if (err)
            {
                reject(err);
            }
            else
            {
                if(hashObj)
                {
                    if(hashObj["DVP-CompanyId"] && hashObj["DVP-TenantId"] && hashObj["DVP-CompanyId"] === companyId.toString() && hashObj["DVP-TenantId"] === tenantId.toString())
                    {
                        var callServerId = hashObj["FreeSWITCH-Switchname"];
                        dbmodel.CallServer.find({where: [{id: callServerId}, {Activate: true}]})
                            .then(function (csData)
                            {
                                if(csData)
                                {
                                    var ip = csData.InternalMainIP;
                                    if (ip)
                                    {
                                        var options = {
                                            method: 'GET',
                                            uri: "http://" + ip + ":8080/webapi/uuid_kill?" + channelId,
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'Accept': 'application/json',
                                                'Authorization': 'Basic ' + new Buffer(config.FreeSwitch.userName + ':' + config.FreeSwitch.password).toString('base64')
                                            }
                                        };

                                        request(options, function (error, response, body)
                                        {
                                            if (error)
                                            {
                                                reject(error);
                                            }
                                            else
                                            {
                                                fulfill(true);
                                            }
                                        });

                                    }
                                    else
                                    {
                                        reject(new Error('Call server ip not set'));

                                    }

                                }
                                else
                                {
                                    reject(new Error('Cannot find a call server for call'));
                                }

                            })
                            .catch(function(err)
                            {
                                reject(err);
                            });

                    }
                    else
                    {
                        reject(new Error('Company validation failed'));
                    }

                }
                else
                {
                    reject(new Error('Call not found for channel id'));
                }
            }
        });

    })

};

var callHold = function(reqId, channelId, companyId, tenantId, hold)
{
    return new Promise(function(fulfill, reject)
    {
        redisHandler.GetFromHash(reqId, channelId, function (err, hashObj)
        {
            if (err)
            {
                reject(err);
            }
            else
            {
                if(hashObj)
                {
                    if(hashObj["DVP-CompanyId"] && hashObj["DVP-TenantId"] && hashObj["DVP-CompanyId"] === companyId.toString() && hashObj["DVP-TenantId"] === tenantId.toString())
                    {
                        var callServerId = hashObj["FreeSWITCH-Switchname"];
                        dbmodel.CallServer.find({where: [{id: callServerId}, {Activate: true}]})
                            .then(function (csData)
                            {
                                if(csData)
                                {
                                    var ip = csData.InternalMainIP;
                                    if (ip)
                                    {
                                        var holdUrl = "http://" + ip + ":8080/webapi/uuid_hold?" + channelId;
                                        if(!hold){
                                            holdUrl = "http://" + ip + ":8080/webapi/uuid_hold?off " + channelId;
                                        }

                                        var options = {
                                            method: 'GET',
                                            uri: holdUrl,
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'Accept': 'application/json',
                                                'Authorization': 'Basic ' + new Buffer(config.FreeSwitch.userName + ':' + config.FreeSwitch.password).toString('base64')
                                            }
                                        };

                                        request(options, function (error, response, body)
                                        {
                                            if (error)
                                            {
                                                reject(error);
                                            }
                                            else
                                            {
                                                fulfill(true);
                                            }
                                        });

                                    }
                                    else
                                    {
                                        reject(new Error('Call server ip not set'));

                                    }

                                }
                                else
                                {
                                    reject(new Error('Cannot find a call server for call'));
                                }

                            })
                            .catch(function(err)
                            {
                                reject(err);
                            });

                    }
                    else
                    {
                        reject(new Error('Company validation failed'));
                    }

                }
                else
                {
                    reject(new Error('Call not found for channel id'));
                }
            }
        });

    })

};

var callMute = function(reqId, channelId, companyId, tenantId, mute)
{
    return new Promise(function(fulfill, reject)
    {
        redisHandler.GetFromHash(reqId, channelId, function (err, hashObj)
        {
            if (err)
            {
                reject(err);
            }
            else
            {
                if(hashObj)
                {
                    if(hashObj["DVP-CompanyId"] && hashObj["DVP-TenantId"] && hashObj["DVP-CompanyId"] === companyId.toString() && hashObj["DVP-TenantId"] === tenantId.toString())
                    {
                        var callServerId = hashObj["FreeSWITCH-Switchname"];
                        dbmodel.CallServer.find({where: [{id: callServerId}, {Activate: true}]})
                            .then(function (csData)
                            {
                                if(csData)
                                {
                                    var ip = csData.InternalMainIP;
                                    if (ip)
                                    {
                                        var muteUrl = "http://" + ip + ":8080/webapi/uuid_audio?" + channelId+" start write mute -4";
                                        if(!mute){
                                            muteUrl = "http://" + ip + ":8080/webapi/uuid_audio?" + channelId+" start write mute 0";
                                        }

                                        var options = {
                                            method: 'GET',
                                            uri: muteUrl,
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'Accept': 'application/json',
                                                'Authorization': 'Basic ' + new Buffer(config.FreeSwitch.userName + ':' + config.FreeSwitch.password).toString('base64')
                                            }
                                        };

                                        request(options, function (error, response, body)
                                        {
                                            if (error)
                                            {
                                                reject(error);
                                            }
                                            else
                                            {
                                                fulfill(true);
                                            }
                                        });

                                    }
                                    else
                                    {
                                        reject(new Error('Call server ip not set'));

                                    }

                                }
                                else
                                {
                                    reject(new Error('Cannot find a call server for call'));
                                }

                            })
                            .catch(function(err)
                            {
                                reject(err);
                            });

                    }
                    else
                    {
                        reject(new Error('Company validation failed'));
                    }

                }
                else
                {
                    reject(new Error('Call not found for channel id'));
                }
            }
        });

    })

};

var sendDtmf = function(reqId, channelId, companyId, tenantId, dtmf)
{
    return new Promise(function(fulfill, reject)
    {
        redisHandler.GetFromHash(reqId, channelId, function (err, hashObj)
        {
            if (err)
            {
                reject(err);
            }
            else
            {
                if(hashObj)
                {
                    if(hashObj["DVP-CompanyId"] && hashObj["DVP-TenantId"] && hashObj["DVP-CompanyId"] === companyId.toString() && hashObj["DVP-TenantId"] === tenantId.toString())
                    {
                        var callServerId = hashObj["FreeSWITCH-Switchname"];
                        dbmodel.CallServer.find({where: [{id: callServerId}, {Activate: true}]})
                            .then(function (csData)
                            {
                                if(csData)
                                {
                                    var ip = csData.InternalMainIP;
                                    if (ip)
                                    {
                                        var dtmfUrl = "http://" + ip + ":8080/webapi/uuid_send_dtmf?" + channelId+" "+dtmf;


                                        var options = {
                                            method: 'GET',
                                            uri: dtmfUrl,
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'Accept': 'application/json',
                                                'Authorization': 'Basic ' + new Buffer(config.FreeSwitch.userName + ':' + config.FreeSwitch.password).toString('base64')
                                            }
                                        };

                                        request(options, function (error, response, body)
                                        {
                                            if (error)
                                            {
                                                reject(error);
                                            }
                                            else
                                            {
                                                fulfill(true);
                                            }
                                        });

                                    }
                                    else
                                    {
                                        reject(new Error('Call server ip not set'));

                                    }

                                }
                                else
                                {
                                    reject(new Error('Cannot find a call server for call'));
                                }

                            })
                            .catch(function(err)
                            {
                                reject(err);
                            });

                    }
                    else
                    {
                        reject(new Error('Company validation failed'));
                    }

                }
                else
                {
                    reject(new Error('Call not found for channel id'));
                }
            }
        });

    })

};

var sendMessage = function(reqId, channelId, companyId, tenantId, message)
{
    return new Promise(function(fulfill, reject)
    {
        redisHandler.GetFromHash(reqId, channelId, function (err, hashObj)
        {
            if (err)
            {
                reject(err);
            }
            else
            {
                if(hashObj)
                {
                    if(hashObj["DVP-CompanyId"] && hashObj["DVP-TenantId"] && hashObj["DVP-CompanyId"] === companyId.toString() && hashObj["DVP-TenantId"] === tenantId.toString())
                    {
                        var callServerId = hashObj["FreeSWITCH-Switchname"];
                        dbmodel.CallServer.find({where: [{id: callServerId}, {Activate: true}]})
                            .then(function (csData)
                            {
                                if(csData)
                                {
                                    var ip = csData.InternalMainIP;
                                    if (ip)
                                    {
                                        var messageUrl = "http://" + ip + ":8080/webapi/uuid_chat?" + channelId+" "+message;


                                        var options = {
                                            method: 'GET',
                                            uri: messageUrl,
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'Accept': 'application/json',
                                                'Authorization': 'Basic ' + new Buffer(config.FreeSwitch.userName + ':' + config.FreeSwitch.password).toString('base64')
                                            }
                                        };

                                        request(options, function (error, response, body)
                                        {
                                            if (error)
                                            {
                                                reject(error);
                                            }
                                            else
                                            {
                                                fulfill(true);
                                            }
                                        });

                                    }
                                    else
                                    {
                                        reject(new Error('Call server ip not set'));

                                    }

                                }
                                else
                                {
                                    reject(new Error('Cannot find a call server for call'));
                                }

                            })
                            .catch(function(err)
                            {
                                reject(err);
                            });

                    }
                    else
                    {
                        reject(new Error('Company validation failed'));
                    }

                }
                else
                {
                    reject(new Error('Call not found for channel id'));
                }
            }
        });

    })

};


var CallDispatch = function (tenantId, companyId, bargeMethod, req, res) {

    var reqId = nodeUuid.v1();
    var channelId = req.params.channelId;
    var crn = req.params.channelId;
    var protocol = req.body.protocol;
    var destination = req.body.destination;

    redisHandler.GetFromHash(reqId, channelId, function (err, hashObj) {
        if (err)
        {
            logger.error('[DVP-MonitorRestAPI.CallDispatch] - [%s] - Exception thrown from redisHandler.GetObject', reqId, err);
            var jsonString = messageFormatter.FormatMessage(err, "", false, undefined);
            logger.debug('[DVP-MonitorRestAPI.CallDispatch] - [%s] - API RESPONSE : %s', reqId, jsonString);
            res.end(jsonString);
        }
        else
        {
            if (hashObj)
            {
                var callServerId = hashObj["FreeSWITCH-Switchname"];
                dbmodel.CallServer.find({where: [{id: callServerId}, {Activate: true}]}).then(function (csData)
                {
                    if (csData)
                    {
                        logger.debug("DVP-MonitorRestAPI.CallDispatch id %d Found", reqId);
                        var ip = csData.InternalMainIP;
                        if (ip)
                        {
                            var dvpActionCat = 'LISTEN';
                            var data = format("&eavesdrop({0})", crn);
                            if (bargeMethod.toLowerCase() == "barge")
                            {
                                dvpActionCat = 'BARGE';
                                data = format("'queue_dtmf:w2@500,eavesdrop:{0}' inline", crn);
                            }
                            else if (bargeMethod.toLowerCase() == "threeway")
                            {
                                dvpActionCat = 'THREEWAY';
                                data = format("'queue_dtmf:w3@500,eavesdrop:{0}' inline", crn);
                            }


                            var options =
                            {
                                method: 'GET',
                                uri: "http://" + ip + ":8080/webapi/" + "create_uuid",
                                headers:
                                {
                                    'Content-Type': 'application/json',
                                    'Accept': 'application/json',
                                    'Authorization': 'Basic ' + new Buffer(config.FreeSwitch.userName + ':' + config.FreeSwitch.password).toString('base64')
                                }
                            };

                            request(options, function (error, response, body)
                            { // Create Cart
                                if (error)
                                {
                                    var instance = messageFormatter.FormatMessage(error, "create_uuid", false, body);
                                    res.end(instance);
                                }
                                else
                                {
                                    //var options = format("{{return_ring_ready=false,origination_uuid={0},origination_caller_id_number={1},DVP_ACTION_CAT={2},DVP_OPERATION_CAT=PRIVATE_USER,companyid={3},tenantid={4},Other-Leg-Unique-ID={5}}", reqId, channelId, dvpActionCat, companyId, tenantId, channelId);

                                    var dialoption = format("return_ring_ready=false,origination_uuid={0},origination_caller_id_number={1},DVP_ACTION_CAT={2},DVP_OPERATION_CAT=PRIVATE_USER,companyid={3},tenantid={4},DVP_CALLMONITOR_OTHER_LEG={5}", reqId, channelId, dvpActionCat, companyId, tenantId, channelId);

                                    logger.debug('[DVP-MonitorRestAPI.CallDispatch] - [%s] - options : %s', reqId, dialoption);

                                    if (protocol.toLowerCase() == "user")
                                    {

                                        dbmodel.Extension.find({
                                            where: [{Extension: destination}, {TenantId: tenantId}, {CompanyId: companyId}],
                                            include: [
                                                {
                                                    model: dbmodel.SipUACEndpoint, as: "SipUACEndpoint",
                                                    include: [
                                                        {model: dbmodel.CloudEndUser, as: "CloudEndUser"}
                                                    ]
                                                }
                                            ]

                                        }).then(function (user)
                                        {
                                            if (user)
                                            {
                                                var tempURL = user.SipUACEndpoint.SipUsername + "@" + user.SipUACEndpoint.CloudEndUser.Domain;

                                                destination = tempURL ? format("user/{0}", tempURL) : format("user/{0}", destination);

                                                var command = util.format("originate? {%s}%s %s", dialoption, destination, data);

                                                //var command = format("originate? {0}{1} {2}", dialoption, destination, data);

                                                logger.debug('[DVP-MonitorRestAPI.CallDispatch] - [%s] - command : %s', reqId, command);

                                                var options = {
                                                    method: 'GET',
                                                    uri: "http://" + ip + ":8080/webapi/" + command,
                                                    headers: {
                                                        'Content-Type': 'application/json',
                                                        'Accept': 'application/json',
                                                        'Authorization': 'Basic ' + new Buffer(config.FreeSwitch.userName + ':' + config.FreeSwitch.password).toString('base64')
                                                    }
                                                };

                                                request(options, function (error, response, body) { // Create Cart

                                                    if (error) {
                                                        var instance = messageFormatter.FormatMessage(error, "SendGetCommandToCallServer", false, body);
                                                        res.end(instance);
                                                    }
                                                    else {
                                                        var instance = messageFormatter.FormatMessage(undefined, "SendGetCommandToCallServer", true, body);
                                                        res.end(instance);
                                                    }
                                                });
                                            }
                                            else {
                                                return null;
                                            }
                                        }).catch(function (err) {
                                            logger.error("DVP-GetFullQualifiedSipUri PGSQL %s failed", destination, err);
                                            res.write(messageFormatter.FormatMessage(err, "Extension NotFound or error", false, undefined));
                                            res.end();
                                        });

                                    }
                                    else {

                                        var command = format("originate? {0}{1} {2}", options, destination, data);

                                        var options = {
                                            method: 'GET',
                                            uri: "http://" + ip + ":8080/webapi/" + command,
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'Accept': 'application/json',
                                                'Authorization': 'Basic ' + new Buffer(config.FreeSwitch.userName + ':' + config.FreeSwitch.password).toString('base64')
                                            }
                                        };

                                        request(options, function (error, response, body) { // Create Cart
                                            if (error) {
                                                var instance = messageFormatter.FormatMessage(error, "send msg", false, body);
                                                res.end(instance);
                                            } else {
                                                var instance = messageFormatter.FormatMessage(undefined, "SendGetCommandToCallServer", true, response);
                                                res.end(instance);
                                            }
                                        });


                                    }

                                }
                            });


                        }
                        else {
                            var err = new Error("invalid callServer IP.");
                            logger.error("DVP-GetCallServerByID IP %d Failed", channelId, err);
                            var instance = messageFormatter.FormatMessage(err, "Get callserver by ID", false, undefined);
                            res.end(instance);
                        }

                    }
                    else {
                        var err = new Error("invalid callServerId.");
                        logger.error("DVP-GetCallServerByID id %d Failed", callServerId, err);
                        var instance = messageFormatter.FormatMessage(err, "invalid callServerId", false, undefined);
                        res.write(instance);
                        res.end();
                    }

                }).catch(function (err) {
                    logger.error("DVP-ClusterConfiguration.GetCallServerByID id %d Failed", callServerId, err);
                    var instance = messageFormatter.FormatMessage(err, "Get callserver by ID", false, undefined);
                    res.write(instance);
                    res.end();
                });
            }
            else {
                var jsonString = messageFormatter.FormatMessage(new Error("invalid channelId."), "invalid channelId", false, undefined);
                logger.debug('[DVP-MonitorRestAPI.GetChannelById] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }
        }
    });


};

module.exports.CallBargin = function (tenantId, companyId, req, res) {

    CallDispatch(tenantId, companyId, "barge", req, res);
};

module.exports.CallThreeway = function (tenantId, companyId, req, res) {

    CallDispatch(tenantId, companyId, "threeway", req, res);
};

module.exports.CallListen = function (tenantId, companyId, req, res) {

    CallDispatch(tenantId, companyId, "listen", req, res);
};

// ---------------------- FreeSwitch Service Handler ---------------------- \\

function SendPostCommandToCallServer(callServerId, data, command, callBack) {

    var options = {
        method: 'POST',
        uri: "http://" + callServerId + ":8080/webapi/" + command,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Basic ' + new Buffer(config.FreeSwitch.userName + ':' + config.FreeSwitch.password).toString('base64')
        },
        body: data
    };
    request(options, function (error, response, body) {
        if (error) {
            var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
            logger.error('[DVP-SendPostCommandToCallServer] - [%s] - [%s] - Error.', response, body, error);
            callBack.end(jsonString);
        } else {
        }
    })
}

function SendGetCommandToCallServer(callServerIp, command, callBack) {

    var options = {
        method: 'GET',
        uri: "http://" + callServerIp + ":8080/webapi/" + command,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Basic ' + new Buffer(config.FreeSwitch.userName + ':' + config.FreeSwitch.password).toString('base64')
        }
    };

    request(options, function (error, response, body) { // Create Cart


    });

}

// ---------------------- FreeSwitch Service Handler ---------------------- \\

module.exports.callDisconnect = callDisconnect;
module.exports.callHold = callHold;
module.exports.callMute = callMute;
module.exports.sendDtmf =sendDtmf;
module.exports.sendMessage = sendMessage;