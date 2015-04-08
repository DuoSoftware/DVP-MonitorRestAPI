var dbModel = require('./DVP-DBModels');

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

module.exports.GetDomainByCompany = GetDomainByCompany;