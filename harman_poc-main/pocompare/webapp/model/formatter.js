sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/Device"
], 
function (JSONModel, Device) {
    "use strict";

    return {
        /**
         * Provides runtime information for the device the UI5 app is running on as a JSONModel.
         * @returns {sap.ui.model.json.JSONModel} The device model.
         */
        stateFormatter: function (sStatus) {
            if(sStatus=="1"){
                return "Information"
            }else if(sStatus=="2"){
                return "Success"
            }else if(sStatus=="3"){
                return "Error"
            }
        },
        statusDescription: function (sStatus) {
            if(sStatus=="1"){
                return "Pending"
            }else if(sStatus=="2"){
                return "Approved"
            }else if(sStatus=="3"){
                return "Rejected"
            }
        },
        formatDate: function (sValue) {
            if (!sValue) return "";
            // Accept yyyy-MM-dd or yyyy/MM/dd or MM/dd/yyyy already
            var oParsed;
            // Try yyyy-MM-dd
            var rISO = /^(\d{4})[-/](\d{2})[-/](\d{2})$/;
            var rMDY = /^(\d{2})[-/](\d{2})[-/](\d{4})$/;
            var mISO = sValue.match(rISO);
            var mMDY = sValue.match(rMDY);
            if (mISO) {
                return mISO[2] + "/" + mISO[3] + "/" + mISO[1];
            } else if (mMDY) {
                return mMDY[1] + "/" + mMDY[2] + "/" + mMDY[3];
            }
            return sValue;
        }
    };

});