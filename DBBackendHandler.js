var dbModel = require('DVP-DBModels');
var logger = require('DVP-Common/LogHandler/CommonLogHandler.js').logger;

var GetConferenceRoomWithCompany = function(reqId, roomName, companyId, tenantId, callback)
{
    try
    {
        logger.debug('[DVP-MonitorRestAPI.GetConferenceRoomWithCompany] - [%s] - Method Params - roomName : %s, companyId : %s, tenantId : %s', reqId, roomName, companyId, tenantId);

        dbModel.Conference.find({where: [{CompanyId: companyId},{TenantId: tenantId},{ConferenceName: roomName}]})
            .complete(function (err, conf)
            {
                if(err)
                {
                    logger.error('[DVP-MonitorRestAPI.GetConferenceRoomWithCompany] - [%s] - PGSQL query failed', reqId, err);
                }
                else
                {
                    logger.debug('[DVP-MonitorRestAPI.GetConferenceRoomWithCompany] - [%s] - PGSQL query success', reqId);
                }
                callback(err, conf);
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
            .complete(function (err, cloudInfo)
            {
                if(err)
                {
                    logger.error('[DVP-MonitorRestAPI.GetCallServersForCluster] - [%s] - PGSQL query failed', reqId, err);
                }
                else
                {
                    logger.debug('[DVP-MonitorRestAPI.GetCallServersForCluster] - [%s] - PGSQL query success', reqId);
                }
                callback(err, cloudInfo);
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
            .complete(function (err, endUser)
            {
                if(err)
                {
                    logger.error('[DVP-MonitorRestAPI.GetDomainByCompany] - [%s] - PGSQL query failed', reqId, err);
                }
                else
                {
                    logger.debug('[DVP-MonitorRestAPI.GetDomainByCompany] - [%s] - PGSQL query success', reqId);
                }

                callback(err, endUser);
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
        logger.debug('[DVP-MonitorRestAPI.GetConferenceListByCompany] - [%s] - Method Params - companyId : %s, tenantId : %s', reqId, companyId, tenantId);

        dbModel.Conference.findAll({where: [{CompanyId: companyId},{TenantId: tenantId}]})
            .complete(function (err, confArr)
            {
                if(err)
                {
                    logger.error('[DVP-MonitorRestAPI.GetConferenceListByCompany] - [%s] - PGSQL query failed', reqId, err);
                }
                else
                {
                    logger.debug('[DVP-MonitorRestAPI.GetConferenceListByCompany] - [%s] - PGSQL query success', reqId);
                }

                callback(err, confArr);
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