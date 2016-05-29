/**
 * Created by Rajinda on 2/26/2016.
 */

var messageFormatter = require('dvp-common/CommonMessageGenerator/ClientMessageJsonFormatter.js');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;
var config = require('config');
var redisHandler = require('./RedisHandler.js');
var dbmodel = require('dvp-dbmodels');
var request = require('request');
var format = require('string-format');
var nodeUuid = require('node-uuid');

var getCallServerId = function(reqId, channelId,res){

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
                        var instance = msg.FormatMessage(err, "invalid callServerId", false, undefined);
                        res.write(instance);
                        res.end();
                    }

                }).catch(function (err) {

                    logger.error("DVP-ClusterConfiguration.GetCallServerByID id %d Failed", callServerId, err);

                    var instance = msg.FormatMessage(err, "Get callserver by ID", false, undefined);
                    res.write(instance);

                    res.end();

                });
            }
            else {
                var jsonString = messageFormatter.FormatMessage(new Error("invalid channelId."), "invalid channelId", false, undefined);
                logger.debug('[DVP-MonitorRestAPI.GetChannelById] - [%s] - API RESPONSE : %s', reqId, jsonString);
                res.end(jsonString);
            }
            /*var channelData =
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
             res.end(jsonString);*/
        }


    });
};

var GetFullQualifiedSipUri =function(tenantId, companyId, destination,res){

    dbmodel.Extension.find({
        where: [{Extension: destination},{TenantId:tenantId},{CompanyId:companyId}],
        include: [
            {model: dbmodel.SipUACEndpoint, as: "SipUACEndpoint"},
            {model: dbmodel.CloudEndUser, as: "CloudEndUser"}
        ]
    }).then(function (user) {
        if(user){
            return  user.SipUACEndpoint.SipUsername+"@"+user.CloudEndUser.Domain;
        }
        else{
            return null;
        }
    }).catch(function (err) {
        logger.error("DVP-GetFullQualifiedSipUri PGSQL %s failed", destination, err);
        res.write(msg.FormatMessage(err, "Extension NotFound or error", false, undefined));
        res.end();
    });

};

var CallDispatch = function (tenantId, companyId,bargeMethod, req, res) {

    var reqId = nodeUuid.v1();
    var channelId = req.params.channelId;
    var crn= req.body.crn;
    var protocol= req.body.protocol;
    var destination= req.body.destination;


    getCallServerId(reqId, channelId).then(function(ip){

        if(ip){
            var data = "&eavesdrop({0})".format(crn);
            if(bargeMethod.toLowerCase()=="barge"){
                data = "'queue_dtmf:w2@500,eavesdrop:{0}' inline".format(crn);
            }
            else if(bargeMethod.toLowerCase()=="threeway"){
                data = "'queue_dtmf:w3@500,eavesdrop:{0}' inline".format(crn);
            }

            SendGetCommandToCallServer(ip,"create_uuid",res).then(function(uuid){

                var options = "{{return_ring_ready=false,origination_uuid={0},origination_caller_id_number={1}}}".format( uuid,channelId);

                if(protocol.toLowerCase()== "user"){

                    GetFullQualifiedSipUri(tenantId, companyId, destination,res).then(function(tempURL){

                        destination = tempURL ? "user/{0}".format(tempURL) : "user/{0}".format(destination);

                        var command = "originate? {0}{1} {2}".format(options, destination, data);
                        SendGetCommandToCallServer(ip,command, res).then(function(response){

                            var instance = msg.FormatMessage(undefined, "SendGetCommandToCallServer", true, response);
                            res.end(instance);

                        }).catch(function(err){
                            logger.error("DVP-SendGetCommandToCallServer IP %d Failed", ip, err);
                            var instance = msg.FormatMessage(err, "SendGetCommandToCallServer", false, undefined);
                            res.end(instance);
                        });

                    }).catch(function(err){
                        logger.error("DVP-GetFullQualifiedSipUri IP %d Failed", ip, err);
                        var instance = msg.FormatMessage(err, "SendGetCommandToCallServer", false, undefined);
                        res.end(instance);
                    });
                }
                else{

                    var command = "originate? {0}{1} {2}".format(options, destination, data);
                    SendGetCommandToCallServer(ip,command, res).then(function(response){

                        var instance = msg.FormatMessage(undefined, "SendGetCommandToCallServer", true, response);
                        res.end(instance);

                    }).catch(function(err){
                        logger.error("DVP-SendGetCommandToCallServer IP %d Failed", ip, err);
                        var instance = msg.FormatMessage(err, "SendGetCommandToCallServer", false, undefined);
                        res.end(instance);
                    });
                }
            }).catch(function(err){
                logger.error("DVP-SendGetCommandToCallServer IP %d Failed", ip, err);
                var instance = msg.FormatMessage(err, "SendGetCommandToCallServer", false, undefined);
                res.end(instance);
            });
        }
        else{
            var err = new Error("invalid callServer IP.");
            logger.error("DVP-GetCallServerByID IP %d Failed", channelId, err);
            var instance = msg.FormatMessage(err, "Get callserver by ID", false, undefined);
            res.end(instance);
        }
    }).catch(function(err){
        logger.error("DVP-GetCallServerByID IP %d Failed", channelId, err);
        var instance = msg.FormatMessage(err, "Get callserver by ID", false, undefined);
        res.end(instance);
    });
};

module.exports.CallBargin = function (tenantId, companyId, req, res) {

    CallDispatch(tenantId, companyId,"barge", req, res);
};

module.exports.CallThreeway = function (tenantId, companyId, req, res) {

    CallDispatch(tenantId, companyId,"threeway", req, res);
};

module.exports.CallListen = function (tenantId, companyId, req, res) {

    CallDispatch(tenantId, companyId,"listen", req, res);
};

// ---------------------- FreeSwitch Service Handler ---------------------- \\

function SendPostCommandToCallServer(callServerId, data,command, callBack) {

    var options = {
        method: 'POST',
        uri: "http://"+ callServerId +":8080/webapi/"+command,
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
        uri: "http://"+ callServerIp +":8080/webapi/"+command,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Basic ' + new Buffer(config.FreeSwitch.userName + ':' + config.FreeSwitch.password).toString('base64')
        }
    };
    request(options, function (error, response, body) {
        if (error) {
            var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
            logger.error('[DVP-SendPostCommandToCallServer] - [%s] - [%s] - Error.', response, body, error);
            callBack.end(jsonString);
        } else {
            return body;
        }
    })
}

// ---------------------- FreeSwitch Service Handler ---------------------- \\