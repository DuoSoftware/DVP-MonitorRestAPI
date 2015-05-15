var redis = require("redis");
var Config = require('config');
var logger = require('DVP-Common/LogHandler/CommonLogHandler.js').logger;

var redisIp = Config.Redis.IpAddress;
var redisPort = Config.Redis.Port;

var client = redis.createClient(redisPort, redisIp);

var SetObject = function(reqId, key, value, callback)
{
    try
    {
        logger.debug('[DVP-MonitorRestAPI.SetObject] - [%s] - Method Params - key : %s, value : %s', reqId, key, value);
        //var client = redis.createClient(redisPort, redisIp);

        client.set(key, value, function(err, response)
        {
            if(err)
            {
                logger.error('[DVP-MonitorRestAPI.SetObject] - [%s] - REDIS SET failed', reqId, err);
            }
            else
            {
                logger.debug('[DVP-MonitorRestAPI.SetObject] - [%s] - REDIS SET success', reqId);
            }
            callback(err, response);
        });

    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.SetObject] - [%s] - Exception occurred', reqId, ex);
        callback(ex, undefined);
    }

};

var GetObject = function(reqId, key, callback)
{
    try
    {
        logger.debug('[DVP-MonitorRestAPI.GetObject] - [%s] - Method Params - key : %s', reqId, key);
        //var client = redis.createClient(redisPort, redisIp);

        client.get(key, function(err, response)
        {
            if(err)
            {
                logger.error('[DVP-MonitorRestAPI.GetObject] - [%s] - REDIS SET failed', reqId, err);
            }
            else
            {
                logger.debug('[DVP-MonitorRestAPI.GetObject] - [%s] - REDIS SET success', reqId);
            }
            callback(err, response);
        });

    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.GetObject] - [%s] - Exception occurred', reqId, ex);
        callback(ex, undefined);
    }
};

var PublishToRedis = function(reqId, pattern, message, callback)
{
    try
    {
        logger.debug('[DVP-MonitorRestAPI.PublishToRedis] - [%s] - Method Params - pattern : %s, message : %s', reqId, pattern, message);
        if(client.connected)
        {
            var result = client.publish(pattern, message);
            logger.debug('[DVP-MonitorRestAPI.PublishToRedis] - [%s] - REDIS PUBLISH result : %s', reqId, result);
        }
        callback(undefined, true);

    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.PublishToRedis] - [%s] - Exception occurred', reqId, ex);
        callback(ex, false);
    }
}

var GetFromSet = function(reqId, setName, callback)
{
    try
    {
        logger.debug('[DVP-MonitorRestAPI.GetFromSet] - [%s] - Method Params - setName : %s,', reqId, setName);
        if(client.connected)
        {
            client.smembers(setName, function (err, setValues)
            {
                if(err)
                {
                    logger.error('[DVP-MonitorRestAPI.GetFromSet] - [%s] - REDIS SMEMBERS failed', reqId, err);
                }
                else
                {
                    logger.debug('[DVP-MonitorRestAPI.GetFromSet] - [%s] - REDIS SMEMBERS success', reqId);
                }
                callback(err, setValues);
            });
        }
        else
        {
            callback(new Error('Redis Client Disconnected'), undefined);
        }


    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.GetFromSet] - [%s] - Exception occurred', reqId, ex);
        callback(ex, undefined);
    }
};

var GetFromHash = function(reqId, hashName, callback)
{
    try
    {
        logger.debug('[DVP-MonitorRestAPI.GetFromHash] - [%s] - Method Params - hashName : %s,', reqId, hashName);
        if(client.connected)
        {
            client.hgetall(hashName, function (err, hashObj)
            {
                if(err)
                {
                    logger.error('[DVP-MonitorRestAPI.GetFromHash] - [%s] - REDIS HGETALL failed', reqId, err);
                }
                else
                {
                    logger.debug('[DVP-MonitorRestAPI.GetFromHash] - [%s] - REDIS HGETALL success', reqId);
                }
                callback(err, hashObj);
            });
        }
        else
        {
            callback(new Error('Redis Client Disconnected'), undefined);
        }
    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.GetFromHash] - [%s] - Exception occurred', reqId, ex);
        callback(ex, undefined);
    }
}

client.on('error', function(msg)
{

});

module.exports.SetObject = SetObject;
module.exports.PublishToRedis = PublishToRedis;
module.exports.GetFromSet = GetFromSet;
module.exports.GetFromHash = GetFromHash;
module.exports.GetObject = GetObject;