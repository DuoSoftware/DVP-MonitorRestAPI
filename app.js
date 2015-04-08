var restify = require('restify');
var stringify = require('stringify');
var dbHandler = require('./DBBackendHandler.js');
var redisHandler = require('./RedisHandler.js');
var messageFormatter = require('./DVP-Common/CommonMessageGenerator.js')

var server = restify.createServer({
    name: 'localhost',
    version: '1.0.0'
});

server.use(restify.acceptParser(server.acceptable));
server.use(restify.queryParser());
server.use(restify.bodyParser());

server.get('/DVP/API/:version/MonitorRestAPI/GetSipRegDetailsByCompany/:companyId/:tenantId', function(req, res, next)
{
    try
    {
        var companyId = req.params.companyId;
        var tenantId = req.params.tenantId;

        var userList = [];

        dbHandler.GetDomainByCompany(companyId, tenantId, function (err, endUser)
        {
            if(endUser && endUser.Domain)
            {
                //Get Registration Details From Redis
                redisHandler.GetFromSet('SIPREG@' + endUser.Domain, function(err, userTags)
                {
                    if(userTags && userTags.length > 0)
                    {
                        //get all user hash sets from redis
                        userTags.forEach(function(tag)
                        {
                            redisHandler.GetFromHash(tag, function(err, hashObj)
                            {
                                var user = {
                                    SipUsername : hashObj.SipUsername,
                                    RegistrationStatus : hashObj.RegStatus
                                };

                                userList.push(user);
                            })
                        })

                        var jsonString = JSON.stringify(userList);

                        res.end(jsonString);
                    }
                    else
                    {
                        var jsonString = JSON.stringify(userList);

                        res.end(jsonString);
                    }
                });

            }
            else
            {
                var jsonString = JSON.stringify(userList);

                res.end(jsonString);
            }
        });

        return next();
    }
    catch(ex)
    {
        var jsonString = messageFormatter.FormatMessage(ex, "ERROR", false, undefined);
        res.end(jsonString);
    }

    return next();

});

server.get('/DVP/API/:version/MonitorRestAPI/GetSipRegDetailsByUser/:user/:companyId/:tenantId', function(req, res, next)
{
    try
    {
        var user = req.params.user;
        var companyId = req.params.companyId;
        var tenantId = req.params.tenantId;

        dbHandler.GetDomainByCompany(companyId, tenantId, function (err, endUser)
        {
            if (endUser && endUser.Domain)
            {
                //Get Registration Details From Redis
                var tag = 'SIPUSER:' + user + "@" + endUser.Domain;

                redisHandler.GetFromHash(tag, function (err, hashObj)
                {
                    var user = {
                        SipUsername: hashObj.SipUsername,
                        RegistrationStatus: hashObj.RegStatus,
                        ExtraData: json.parse(hashObj.Data)
                    };

                    userList.push(user);
                })

                var jsonString = JSON.stringify(user);

                res.end(jsonString);
            }
            else
            {
                res.end('{}');
            }
        });


        return next();
    }
    catch(ex)
    {
        var jsonString = messageFormatter.FormatMessage(ex, "ERROR", false, undefined);
        res.end(jsonString);
    }

    return next();

});

server.listen(9093, 'localhost', function () {
    console.log('%s listening at %s', server.name, server.url);
});