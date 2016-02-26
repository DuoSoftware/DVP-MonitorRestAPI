var dbModel = require('dvp-dbmodels');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;

var GetConferenceRoomWithCompany = function(reqId, roomName, companyId, tenantId, callback)
{
    try
    {
        logger.debug('[DVP-MonitorRestAPI.GetConferenceRoomWithCompany] - [%s] - Method Params - roomName : %s, companyId : %s, tenantId : %s', reqId, roomName, companyId, tenantId);

        dbModel.Conference.find({where: [{CompanyId: companyId},{TenantId: tenantId},{ConferenceName: roomName}]})
            .then(function (conf)
            {
                logger.debug('[DVP-MonitorRestAPI.GetConferenceRoomWithCompany] - [%s] - PGSQL query success', reqId);

                callback(undefined, conf);
            }).catch(function(err)
            {
                logger.error('[DVP-MonitorRestAPI.GetConferenceRoomWithCompany] - [%s] - PGSQL query failed', reqId, err);
                callback(err, undefined);
            });
    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.GetConferenceRoomWithCompany] - [%s] - Exception occurred', reqId, ex);
        callback(ex, undefined);
    }
};

var GetCallServersForCluster = function(reqId, clusterId, callback)
{
    try
    {
        logger.debug('[DVP-MonitorRestAPI.GetCallServersForCluster] - [%s] - Method Params - clusterId : %s', reqId, clusterId);

        dbModel.Cloud.find({where: [{id: clusterId}], include: [{model: dbModel.CallServer, as: 'CallServer'}]})
            .then(function (cloudInfo)
            {
                logger.debug('[DVP-MonitorRestAPI.GetCallServersForCluster] - [%s] - PGSQL query success', reqId);

                callback(err, cloudInfo);
            }).catch(function(err)
            {
                logger.error('[DVP-MonitorRestAPI.GetCallServersForCluster] - [%s] - PGSQL query failed', reqId, err);
                callback(err, undefined);
            });
    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.GetCallServersForCluster] - [%s] - Exception occurred', reqId, ex);
        callback(ex, undefined);
    }
};

var GetDomainByCompany = function(reqId, companyId, tenantId, callback)
{
    try
    {
        logger.debug('[DVP-MonitorRestAPI.GetDomainByCompany] - [%s] - Method Params - companyId : %s, tenantId : %s', reqId, companyId, tenantId);
        dbModel.CloudEndUser.find({where: [{CompanyId: companyId},{TenantId: tenantId}]})
            .then(function (endUser)
            {
                logger.debug('[DVP-MonitorRestAPI.GetDomainByCompany] - [%s] - PGSQL query success', reqId);

                callback(undefined, endUser);
            }).catch(function(err)
            {
                logger.error('[DVP-MonitorRestAPI.GetDomainByCompany] - [%s] - PGSQL query failed', reqId, err);
                callback(err, undefined);
            });
    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.GetDomainByCompany] - [%s] - Exception occurred', reqId, ex);
        callback(ex, undefined);
    }
};

var GetConferenceListByCompany = function(reqId, companyId, tenantId, callback)
{
    try
    {
        var tempArr = [];
        logger.debug('[DVP-MonitorRestAPI.GetConferenceListByCompany] - [%s] - Method Params - companyId : %s, tenantId : %s', reqId, companyId, tenantId);

        dbModel.Conference.findAll({where: [{CompanyId: companyId},{TenantId: tenantId}]})
            .then(function (confArr)
            {
                logger.debug('[DVP-MonitorRestAPI.GetConferenceListByCompany] - [%s] - PGSQL query success', reqId);

                callback(undefined, confArr);
            }).catch(function(err)
            {
                logger.error('[DVP-MonitorRestAPI.GetConferenceListByCompany] - [%s] - PGSQL query failed', reqId, err);
                callback(err, tempArr);

            });
    }
    catch(ex)
    {
        logger.error('[DVP-MonitorRestAPI.GetConferenceListByCompany] - [%s] - Exception occurred', reqId, ex);
        callback(ex, undefined);
    }
};

module.exports.GetDomainByCompany = GetDomainByCompany;
module.exports.GetCallServersForCluster = GetCallServersForCluster;
module.exports.GetConferenceListByCompany = GetConferenceListByCompany;
module.exports.GetConferenceRoomWithCompany = GetConferenceRoomWithCompany;
