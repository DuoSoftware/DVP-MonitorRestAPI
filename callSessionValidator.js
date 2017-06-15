/**
 * Created by dinusha on 12/22/2016.
 */
var redis = require("redis");
var Config = require('config');

var redisIp = Config.Redis.ip;
var redisPort = Config.Redis.port;
var redisPassword = Config.Redis.password;

var client = redis.createClient(redisPort, redisIp);

client.auth(redisPassword, function (redisResp) {
    console.log("Redis Auth Response : " + redisResp);
});

var getCallSession = function(sessionId, callback)
{
    try
    {
        if(client.connected)
        {
            client.hgetall(sessionId, function (err, hashObj)
            {
                callback(err, hashObj);
            });
        }
        else
        {
            callback(new Error('Redis Client Disconnected'), null);
        }
    }
    catch(ex)
    {
        callback(ex, null);
    }
};


client.on('error', function(msg)
{

});

module.exports.getCallSession = getCallSession;
