module.exports = {
    "DB": {
        "Type":"postgres",
        "User":"postgres",
        "Password":"",
        "Port":5432,
        "Host":"",
        "Database":"duo"
    },

    "Redis":
        {
            "mode":"instance",//instance, cluster, sentinel
            "ip": "",
            "port": 6379,
            "user": "",
            "password": "",
            "sentinels":{
                "hosts": "",
                "port":6379,
                "name":"redis-cluster"
            }

        },


    "Security":
        {

            "ip" : "",
            "port": 6379,
            "user": "",
            "password": "",
            "mode":"instance",//instance, cluster, sentinel
            "sentinels":{
                "hosts": "",
                "port":6379,
                "name":"redis-cluster"
            }
        },

    "Host":{
        "Ip":"0.0.0.0",
        "Port":"3637",
        "Version":"1.0.0.0"
    },
    "FreeSwitch":{
        "userName":"freeswitch",
        "password":"works"
    }
};
