var redis = require("ioredis");
var config = require('config');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;

var redisip = config.Redis.ip;
var redisport = config.Redis.port;
var redispass = config.Redis.password;
var redismode = config.Redis.mode;



var redisSetting =  {
    port:redisport,
    host:redisip,
    family: 4,
    password: redispass,
    db: 7,
    retryStrategy: function (times) {
        var delay = Math.min(times * 50, 2000);
        return delay;
    },
    reconnectOnError: function (err) {

        return true;
    }
};

if(redismode == 'sentinel'){

    if(config.Redis.sentinels && config.Redis.sentinels.hosts && config.Redis.sentinels.port && config.Redis.sentinels.name){
        var sentinelHosts = config.Redis.sentinels.hosts.split(',');
        if(Array.isArray(sentinelHosts) && sentinelHosts.length > 2){
            var sentinelConnections = [];

            sentinelHosts.forEach(function(item){

                sentinelConnections.push({host: item, port:config.Redis.sentinels.port})

            })

            redisSetting = {
                sentinels:sentinelConnections,
                name: config.Redis.sentinels.name,
                password: redispass
            }

        }else{

            console.log("No enough sentinel servers found .........");
        }

    }
}

var client = undefined;

if(redismode != "cluster") {
    client = new redis(redisSetting);
}else{

    var redisHosts = redisip.split(",");
    if(Array.isArray(redisHosts)){


        redisSetting = [];
        redisHosts.forEach(function(item){
            redisSetting.push({
                host: item,
                port: redisport,
                family: 4,
                db: 7,
                password: redispass});
        });

        var client = new redis.Cluster([redisSetting]);

    }else{

        client = new redis(redisSetting);
    }


}


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
        var result = client.publish(pattern, message);
        logger.debug('[DVP-MonitorRestAPI.PublishToRedis] - [%s] - REDIS PUBLISH result : %s', reqId, result);
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
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.GetFromHash] - [%s] - Exception occurred', reqId, ex);
        callback(ex, undefined);
    }
}

var MultipleHashHGetAll = function(reqId, hashKeys, callback)
{
    try
    {
        logger.debug('[DVP-MonitorRestAPI.MultipleHashHGetAll] - [%s],', reqId);
        var pipeline = client.pipeline();

        hashKeys.forEach(function(key, index){
            pipeline.hgetall(key);
        });

        pipeline.exec(function(err, result){
            callback(err, result);
        });
    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.MultipleHashHGetAll] - [%s] - Exception occurred', reqId, ex);
        callback(ex, undefined);
    }
};



var MGetObjects = function(reqId, keyArr, callback)
{
    try
    {
        logger.debug('[DVP-MonitorRestAPI.HMGetObjects] - [%s]', reqId);
        //var client = redis.createClient(redisPort, redisIp);

        client.mget(keyArr, function(err, response)
        {
            if(err)
            {
                logger.error('[DVP-MonitorRestAPI.HMGetObjects] - [%s] - REDIS MGET failed', reqId, err);
            }
            else
            {
                logger.debug('[DVP-MonitorRestAPI.HMGetObjects] - [%s] - REDIS MGET success', reqId);
            }

            callback(err, response);
        });

    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.HMGetObjects] - [%s] - Exception occurred', reqId, ex);
        callback(ex, undefined);
    }
}

var GetKeys = function(reqId, pattern, callback)
{
    logger.debug('[DVP-MonitorRestAPI.GetKeys] - [%s] - Method Params - pattern : %s,', reqId, pattern);
    client.keys(pattern, function (err, keyArr)
    {
        if(err)
        {
            logger.error('[DVP-MonitorRestAPI.GetKeys] - [%s] - REDIS MATCHKEYS failed', reqId, err);
        }
        else
        {
            logger.debug('[DVP-MonitorRestAPI.GetKeys] - [%s] - REDIS MATCHKEYS success', reqId);
        }
        callback(err, keyArr);
    });
}

client.on('error', function(msg)
{

});

module.exports.SetObject = SetObject;
module.exports.PublishToRedis = PublishToRedis;
module.exports.GetFromSet = GetFromSet;
module.exports.GetFromHash = GetFromHash;
module.exports.GetObject = GetObject;
module.exports.GetKeys = GetKeys;
module.exports.MGetObjects = MGetObjects;
module.exports.MultipleHashHGetAll = MultipleHashHGetAll;