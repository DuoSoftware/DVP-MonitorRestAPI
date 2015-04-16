var dbModel = require('./DVP-DBModels');

var GetConferenceRoomWithCompany = function(roomName, companyId, tenantId, callback)
{
    try
    {
        dbModel.Conference.find({where: [{CompanyId: companyId},{TenantId: tenantId},{ConferenceName: roomName}]})
            .complete(function (err, conf)
            {
                callback(err, conf);
            });
    }
    catch(ex)
    {
        callback(ex, undefined);
    }
}

var GetDomainByCompany = function(companyId, tenantId, callback)
{
    try
    {
        dbModel.CloudEndUser.find({where: [{CompanyId: companyId},{TenantId: tenantId}]})
            .complete(function (err, endUser)
            {
                if(err)
                {
                    callback(err, undefined);
                }
                else
                {
                    callback(undefined, endUser);
                }
            });
    }
    catch(ex)
    {
        callback(ex, undefined);
    }
};

var GetConferenceListByCompany = function(companyId, tenantId, callback)
{
    try
    {
        dbModel.Conference.findAll({where: [{CompanyId: companyId},{TenantId: tenantId}]})
            .complete(function (err, confArr)
            {
                callback(err, confArr);
            });
    }
    catch(ex)
    {
        callback(ex, undefined);
    }
};

module.exports.GetDomainByCompany = GetDomainByCompany;
module.exports.GetConferenceListByCompany = GetConferenceListByCompany;
module.exports.GetConferenceRoomWithCompany = GetConferenceRoomWithCompany;