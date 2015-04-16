var redis = require("redis");
var Config = require('config');

var redisIp = Config.Redis.IpAddress;
var redisPort = Config.Redis.Port;

var client = redis.createClient(redisPort, redisIp);

var SetObject = function(key, value, callback)
{
    try
    {
        //var client = redis.createClient(redisPort, redisIp);

        client.set(key, value, function(err, response)
        {
            callback(err, response);
        });

    }
    catch(ex)
    {
        callback(ex, undefined);
    }

};

var GetObject = function(key, callback)
{
    try
    {
        //var client = redis.createClient(redisPort, redisIp);

        client.get(key, function(err, response)
        {
            callback(err, response);
        });

    }
    catch(ex)
    {
        callback(ex, undefined);
    }
};

var PublishToRedis = function(pattern, message, callback)
{
    try
    {
        if(client.connected)
        {
            var result = client.publish(pattern, message);
        }
        callback(undefined, true);

    }
    catch(ex)
    {
        callback(ex, undefined);
    }
}

var GetFromSet = function(setName, callback)
{
    try
    {
        if(client.connected)
        {
            client.smembers(setName, function (err, setValues)
            {
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
        callback(ex, undefined);
    }
};

var GetFromHash = function(hashName, callback)
{
    try
    {
        if(client.connected)
        {
            client.hgetall(hashName, function (err, hashObj)
            {
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