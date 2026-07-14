sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/export/Spreadsheet",
    "com/sap/poexcel/model/formatter",
    "sap/ui/core/Fragment"
], (Controller,JSONModel,Filter,FilterOperator,MessageToast,MessageBox,Spreadsheet,formatter,Fragment) => {
    "use strict";
    var that;

    return Controller.extend("com.sap.poexcel.controller.First", {
        formattter:formatter,
        onInit() {
            that=this
            // Initialize the model that will hold our Excel data
            var oModel = new JSONModel({
                data: []
            });
            this.getOwnerComponent().setModel(oModel, "excelModel");
            this.lineItemFlag=true
            this.sublineItemFlag=true
            this.oFilterBar=this.getView().byId("idTreeFilterBar")
            
        },
        onAfterRendering: function () {
        },
        onActionButtonPress: function (oEvent) {
                var oButton = oEvent.getSource();
                that.oCurrBtn=oButton;
                
                // Get the binding context of the specific table row clicked
                var oContext = oButton.getBindingContext("excelModel");

                // Load the ActionSheet fragment if it doesn't exist yet
                if (!this._oActionSheet) {
                    this._oActionSheet = sap.ui.xmlfragment(
                        "com.sap.poexcel.view.fragments.ActionSheet", 
                        this
                    );
                    this.getView().addDependent(this._oActionSheet);
                }

                // Pass the row's context directly to the ActionSheet so its inner buttons can see 'excelModel'
                this._oActionSheet.setBindingContext(oContext, "excelModel");

                // Open the ActionSheet next to the clicked button
                this._oActionSheet.openBy(oButton);
            },

        //Value Help Start
        getUniqueValueHelpDesc: function (data) {
            // 1. Use Maps to ensure uniqueness by Code, while holding the Description
            const materialMap = new Map();
            const vendorMap = new Map();
            const poSet = new Set(); // PO doesn't have a separate description field in the JSON

            data.forEach(item => {
                // Material + Description
                if (item.Material && !materialMap.has(item.Material)) {
                    materialMap.set(item.Material, item.MaterialDesc || "");
                }
                // Vendor + Description (VendorName)
                if (item.VendorCode && !vendorMap.has(item.VendorCode)) {
                    vendorMap.set(item.VendorCode, item.VendorName || "");
                }
                // PO Number
                if (item.PONumber) {
                    poSet.add(item.PONumber);
                }
            });

            // 2. Convert Maps/Sets into sorted arrays of objects for UI binding
            return {
                MaterialHelp: Array.from(materialMap.entries())
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([code, desc]) => ({
                        MaterialCode: code,
                        MaterialDesc: desc
                    })),
                    
                VendorHelp: Array.from(vendorMap.entries())
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([code, name]) => ({
                        VendorCode: code,
                        VendorName: name
                    })),

                POHelp: Array.from(poSet)
                    .sort()
                    .map(po => ({
                        PONumber: po
                    }))
            };
            
        },
        onValueHelpRequest: function (oEvent) {
            var oView = this.getView();
            
            // 1. Get the ID of the control that triggered the event
            // e.g., "idMaterialCodeInput" or "container-poexcel---main--idMaterialCodeInput"
            var sSourceId = oEvent.getSource().getId();
            
            // 2. Extract the base field name (MaterialCode, PONumber, or VendorCode)
            var sFieldName = "";
            if (sSourceId.includes("idMaterialCodeInput")) {
                sFieldName = "MaterialCode";
            } else if (sSourceId.includes("idPONumberInput")) {
                sFieldName = "PONumber";
            } else if (sSourceId.includes("idVendorCodeInput")) {
                sFieldName = "VendorCode";
            } else {
                return; // Unrecognized input field
            }

            // 3. Initialize a map to hold the separate dialog promises if it doesn't exist yet
            if (!this._mValueHelpDialogs) {
                this._mValueHelpDialogs = {};
            }

            // 4. Load the specific fragment dynamically if it hasn't been loaded before
            if (!this._mValueHelpDialogs[sFieldName]) {
                this._mValueHelpDialogs[sFieldName] = Fragment.load({
                    id: oView.getId(),
                    // Dynamically constructs: "com.sap.poexcel.view.fragments.valuehelp.MaterialCode" etc.
                    name: "com.sap.poexcel.view.fragments.valuehelp." + sFieldName,
                    controller: this
                }).then(function (oValueHelpDialog) {
                    oView.addDependent(oValueHelpDialog);
                    return oValueHelpDialog;
                });
            }

            // 5. Open the correct dialog
            this._mValueHelpDialogs[sFieldName].then(function (oValueHelpDialog) {
                // Pass the field name to your config function if it needs context
                // this._configValueHelpDialog(sFieldName); 
                this._sFieldInputName ="id"+ sFieldName+"Input"; // Store the current field name for use in the dialog's logic
                this._sFieldName =sFieldName // Store the current field name for use in the dialog's logic
                oValueHelpDialog.open();
            }.bind(this));
        },
        onSearch: function (oEvent) {
			var sValue = oEvent.getParameter("value");
			var oFilter = new Filter(this._sFieldName, FilterOperator.Contains, sValue);
			var oBinding = oEvent.getParameter("itemsBinding");
			oBinding.filter([oFilter]);
		},
        onValueHelpDialogClose: function (oEvent) {
			var oSelectedItem = oEvent.getParameter("selectedItem"),
				oInput = this.byId(this._sFieldInputName);

			if (!oSelectedItem) {
				oInput.resetProperty("value");
				return;
			}

			oInput.setValue(oSelectedItem.getTitle());
		},

        //Value Help End

        //Filter Bar Logic Start

       onSearchFilterBar: function () {
            var oModel = this.getView().getModel("excelModel");
            
            // 1. Keep a pristine copy of your original dataset (Only once on initial load)

            var sExcelUploaderValue = this.byId("excelUploader")?.mProperties?.value;
            if(!sExcelUploaderValue){
                return ""
            }

            if (!this._oOriginalData) {
                this._oOriginalData = JSON.parse(JSON.stringify(oModel.getProperty("/data")));
            }

            // 2. Extract active filter criteria from the FilterBar
            var oActiveFilters = {};
            this.oFilterBar.getFilterGroupItems().forEach(function (oItem) {
                var oControl = oItem.getControl();
                var sName = oItem.getName();
                var sClassName = oControl.getMetadata().getName();
                
                if (sClassName === "sap.m.DateRangeSelection") {
                    var oDateStart = oControl.getDateValue();
                    var oDateEnd = oControl.getSecondDateValue();
                    if (oDateStart && oDateEnd) {
                        var oStart = new Date(oDateStart); oStart.setHours(0,0,0,0);
                        var oEnd = new Date(oDateEnd); oEnd.setHours(23,59,59,999);
                        oActiveFilters[sName] = { isDateRange: true, start: oStart.getTime(), end: oEnd.getTime() };
                    }
                } 
                else if (sClassName === "sap.m.ComboBox") {    
                    var sSelectedKey = oControl.getSelectedKey();
                    if (sSelectedKey && sSelectedKey !== "") {        
                        oActiveFilters[sName] = { isSelectKey: true, value: sSelectedKey.trim() };
                    }
                } 
                else {
                    var sValue = oControl.getValue ? oControl.getValue() : null;
                    if (sValue) {
                        oActiveFilters[sName] = sValue.toLowerCase().trim();
                    }
                }
            });

            var aFilterKeys = Object.keys(oActiveFilters);

            // If no filters are filled out, instantly restore original tree and exit
            if (aFilterKeys.length === 0) {
                oModel.setProperty("/data", JSON.parse(JSON.stringify(this._oOriginalData)));
                return;
            }

            // 3. Deep evaluation function maintaining exact object reference links to _oOriginalData
            function evaluateAndFilterTree(aNodes, aPendingKeys) {
                if (!aNodes || aNodes.length === 0) { return []; }

                return aNodes.map(function (oNode) {
                    // CRITICAL: Shallow copy structural tracking keys, but retain direct memory linkage to data properties
                    var oClonedNode = Object.assign({}, oNode);

                    // Check which of the remaining filter keys match the current node level
                    var aMatchedKeysAtThisLevel = aPendingKeys.filter(function (sKey) {
                        var filterConfig = oActiveFilters[sKey];
                        var nodeValue = oNode[sKey]; // Evaluated directly against the source object reference
                        
                        if (nodeValue === undefined || nodeValue === null) { return false; }

                        if (filterConfig && filterConfig.isDateRange) {
                            var oNodeDate = new Date(nodeValue);
                            if (isNaN(oNodeDate.getTime())) { return false; }
                            return oNodeDate.getTime() >= filterConfig.start && oNodeDate.getTime() <= filterConfig.end;
                        }

                        if (filterConfig && filterConfig.isSelectKey) {
                            return String(nodeValue).trim() === filterConfig.value;
                        }

                        return String(nodeValue).toLowerCase().includes(filterConfig);
                    });

                    // Calculate remaining filter keys
                    var aRemainingKeys = aPendingKeys.filter(function (sKey) {
                        return !aMatchedKeysAtThisLevel.includes(sKey);
                    });

                    // If this node has sub-items (children), dig deeper
                    if (oNode.children && oNode.children.length > 0) {
                        var aFilteredChildren = evaluateAndFilterTree(oNode.children, aRemainingKeys);
                        
                        if (aFilteredChildren.length > 0) {
                            oClonedNode.children = aFilteredChildren;
                            oClonedNode.PanelVisible = true;
                            oClonedNode.NextPanelVisible = true;
                            return oClonedNode;
                        }
                    }

                    // If no children left, check if all active filters were cleared along this line
                    if (aRemainingKeys.length === 0) {
                        // Ensure adjustments made to oClonedNode map back directly to the real reference item
                        return oNode; 
                    }

                    return null;
                }).filter(Boolean);
            }

            // Pass the master data directly to preserve pointer linkages
            var aFilteredData = evaluateAndFilterTree(this._oOriginalData, aFilterKeys);
            oModel.setProperty("/data", aFilteredData);
        },

        // Triggered when a file is selected via the FileUploader
        onFileChange: function (oEvent) {
            var aFiles = oEvent.getParameter("files");
            if (aFiles && aFiles.length > 0) {
                var oFile = aFiles[0];
                this.getView().getModel("excelModel").setProperty("/data", []);   
                this._loadExternalLibrary("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js").then(function() {
                    this._readExcel(oFile);
                }.bind(this))
                .catch(function() {
                    sap.m.MessageToast.show("Failed to load the Excel library from CDN.");
                });
            }
        },
        onClearFile: function () {  
            // sap.m.MessageBox.confirm("Are you sure you want to clear data? Unsaved changes will be lost.", {
            //     title: "Clear Data",
            //     onClose: function (oAction) {
            //         // 3. Only proceed if the user clicked 'OK'
            //         if (oAction === sap.m.MessageBox.Action.OK) {
                        this.byId("excelUploader").clear();
                        this.getView().getModel("excelModel").setProperty("/data", []);
            //         }
            //     }.bind(this) // Crucial: bind 'this' so you can still access this.convertLIFlag
            // });
            // this._headerFB.setVisible(false)
        },
        onCancelTemplate: function () {
            let aExcelInputData=this.getView().getModel("excelModel")?.getProperty("/data");

            this.byId("excelUploader").clear();
            this.byId("idPONumberInput").setValue();
            this.byId("idVendorCodeInput").setValue();
            this.byId("idMaterialCodeInput").setValue();
            this.byId("idDelDateRange").setValue();
            this.byId("idEDIFlagComboBox").setSelectedKey();

            if(aExcelInputData?.length>0){
                    sap.m.MessageBox.confirm("Are you sure you want to clear data? Unsaved changes will be lost.", {
                    title: "Clear Data",
                    onClose: function (oAction) {
                        // 3. Only proceed if the user clicked 'OK'
                        if (oAction === sap.m.MessageBox.Action.OK) {
                            
                            this.getView().getModel("excelModel").setProperty("/data", []);
                            this.getOwnerComponent().getModel("valueHelpModel").setProperty("/MaterialHelp", []);
                            this.getOwnerComponent().getModel("valueHelpModel").setProperty("/POHelp", []);  
                            this.getOwnerComponent().getModel("valueHelpModel").setProperty("/VendorHelp", []);
                            this.getView().getModel("excelModel").setProperty("/data", []);
                        }
                    }.bind(this) // Crucial: bind 'this' so you can still access this.convertLIFlag
                });

            }else{
                // this.byId("excelUploader").setValueState("Information").setValueStateText("No data to clear.");
                MessageToast.show("No data to clear within table");
            }
            
            // this._headerFB.setVisible(false)
        },

        // Helper function using SheetJS (XLSX)
        _readExcel: function (file) {
            var reader = new FileReader();

            reader.onload = function (e) {
                var data = e.target.result;
                
                // Parse the workbook
                var workbook = XLSX.read(data, { type: 'binary', cellDates: true });
                var firstSheetName = workbook.SheetNames[0];
                var worksheet = workbook.Sheets[firstSheetName];
                
                // Get headers only (first row)
                var headers = XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0];

                const REQUIRED_HEADERS = [
                    "Vendor",
                    "Material",
                    "Material Desc",
                    "PO Number", 
                    "Line Item", 
                    "Quantity", 
                    "Delivery Date",
                    "Schedule Line Category"
                ];
                // Convert to JSON
                var jsonData = XLSX.utils.sheet_to_json(worksheet, {
                    raw: false,
                    dateNF: 'yyyy-mm-dd'
                });

                // Map columns
                var formattedData = jsonData.map(function(row) {
                    // Helper function to safely format dates to YYYY-MM-DD
                    var formatDate = function (dateVal) {
                        if (!dateVal) return "";
                        var d = new Date(dateVal);
                        if (isNaN(d.getTime())) return "";

                        var month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
                        var day = d.getUTCDate().toString().padStart(2, '0');
                        var year = d.getUTCFullYear();
                        return month + "/" + day + "/" + year;
                    };
                    return {
                        // Level 1
                        VendorCode: row["Vendor Code"] || row["vendor code"],
                        ODM: row["ODM"],
                        FactorySite: row["Factory site"],
                        Region: row["Region"],
                        Project: row["Project"],
                        PONumber: row["PO Number"] || row["PONumber"] || row["PO#"],
                        PODate: formatDate(row["PO date"]) || formatDate(row["Doc date"]),

                        // Level 2
                        StatDelDate: row["Statistical delivery date"] || row["Statistical Delivery Date"],
                        InitialDates: row["Initial dates:"] || row["Initial dates:"],
                        ODMCRDMar19: row["ODM CRD Mar 19"] || row["ODM CRD Mar 19"],
                        ODMRemark: row["ODM Remark"] || row["ODM Remark"],
                        HarmanRemark: row["Harman Remark"] || row["Harman Remark"],
                        Material: row["Material"] || row["SKU"],
                        POQuantity: row["PO Qty"] || row["PO Quantity"],
                        NetPrice: row["Net Price"] || row["PO U/P"],
                        Currency: row["Currency"] || row["Curr#"],
                        Balance: row["Balance"],
                        Plant: row["Plant"],

                        // Level 3
                        ConfirmationCategory: row["Confirmation category"] || row["Order Status"],
                        ShippingMode: row["Shipping mode"] || row["Shipping Mode"] || row[" Shipping mode "],
                        Booking: row["Booking#"],
                        ExFtCRD: row["Ex-factory/CRD"],
                        RemarkCustomerAPAC: row["Remark/Customer APAC"],
                        HarmanReqDate: row["Harman request Jun 7th"],
                        ODMFeedback: row["ODM feedback Jun 10th"],
                        Item: row["Item"],
                        SequenceNumber: row["Sequence Number"] || row["Sequence number"] || row["Seq Num"],
                        StatusFlag: row["Status"],
                        RejectReason: row["Comment"],
                        ActionDate: formatDate(row["Action Date"]),
                        EmailFlag: row["Email Flag"] || row["EmailFlag"],   
                        EDIFlag: row["EDI Flag"] || row["EDIFlag"],    
                        QlikQty: row["Qlik Qty"] || row["QLIK Qty"],
                        QlikDate: formatDate(row["Qlik Date"] || row["QLIK Date"]),
                        Quantity: row["Quantity"],
                        CreationDate:  formatDate(row["Conf. Date"]) || formatDate(row["Conf Delivery Date"]),
                    }
                });

                const valueHelpData=that.getUniqueValueHelpDesc(formattedData);
                const oValueHelpModel = new JSONModel(valueHelpData);
                that.getOwnerComponent().setModel(oValueHelpModel, "valueHelpModel");


                let aDateNewData=that._processData(formattedData)

                that.aOldData = JSON.parse(JSON.stringify(aDateNewData));  

                that.getOwnerComponent().getModel("excelModel").setProperty("/data", aDateNewData);

                // that._headerFB.setVisible(true)
                MessageToast.show("Excel loaded for preview.");
            };
            reader.onerror = function (ex) {
                MessageBox.error("Error reading the Excel file.");
            };
            reader.readAsBinaryString(file);
        },
         _processData: function (aData) {
            // Ensure aData is an array before processing
            if (!Array.isArray(aData)) {
                return aData;
            }
            var sortData=this.sortData(aData);

            sortData.forEach(row => {
                // 1. Get the dates from the flat row object
                const oDelDate = new Date(row.HarmanReqDate);
                const oCreDate = new Date(row.CreationDate);

                // Check if dates are valid to prevent NaN issues
                if (!isNaN(oDelDate) && !isNaN(oCreDate)) {
                    // 2. Calculate the difference in time
                    const iDiffInTime = oCreDate.getTime() - oDelDate.getTime();
                    
                    // 3. Convert time to days
                    const iDiffInDays = iDiffInTime / (1000 * 3600 * 24);

                    // 4. Check logic: +- 5 days
                    if (Math.abs(iDiffInDays) <= 5) {
                        row.DateState = "Success"; // Green (ValueState.Success)
                        row.DateMsg = "Dates are within the allowed 5-day window";
                    } else {
                        row.DateState = "Error";   // Red (ValueState.Error)
                        row.DateMsg = "Dates fall outside the allowed 5-day window";
                    }
                } else {
                    // Optional: Handle missing or invalid dates
                    row.DateState = "None";
                    row.DateMsg = "Invalid or missing date data";
                }
            });

            

            return sortData;
        },
        sortData:function(aData){
            if (!Array.isArray(aData)) {
                return aData;
            }
            aData.sort((a, b) => {
                // Sort by PONumber
                if (a.PONumber !== b.PONumber) {
                    return a.PONumber.localeCompare(b.PONumber, undefined, { numeric: true, sensitivity: 'base' });
                }
                
                // If PONumber is the same, sort by Item
                if (a.Item !== b.Item) {
                    return a.Item.localeCompare(b.Item, undefined, { numeric: true, sensitivity: 'base' });
                }
                
                // If Item is also the same, sort by SequenceNumber
                return a.SequenceNumber.localeCompare(b.SequenceNumber, undefined, { numeric: true, sensitivity: 'base' });
            });

            return aData;

        },
        onSaveTemplate: async function (oEvent) {
    // 1. Fetch data directly from your master dataset array, ensuring all 19 rows are caught
    // even if the user is currently looking at a filtered set of 3 rows!
    var treeData = JSON.parse(JSON.stringify(this._oOriginalData || this.getView().getModel("excelModel").getProperty("/data")));

    var oCAPModel = this.getOwnerComponent().getModel("capService"); 
    var oActionContext = oCAPModel.bindContext("/sendEMailContent(...)"); 
    oActionContext.setParameter("poHeader", treeData);
    MessageToast.show('Saving in progress...Please Wait');

    try {
        var oResults = await oActionContext.execute();
        treeData = oActionContext.getBoundContext().getObject().value[0]?.data;
        console.log(oResults);
    } catch (oError) {
        console.log(oError);
    }

    // Convert the full 19-record set into spreadsheet flat rows
    var flatExcelData = treeData;
    var sGeneratedMsg = this.getChangeSummary(this.aOldData, treeData);

    var aCols = [
            { label: 'ODM', property: 'ODM', type: 'string' },
            { label: 'Factory site', property: 'FactorySite', type: 'string' },
            { label: 'vendor code', property: 'VendorCode', type: 'string' },
            { label: 'Region', property: 'Region', type: 'string' },
            { label: 'Plant', property: 'Plant', type: 'string' },
            { label: 'Project', property: 'Project', type: 'string' },
            { label: 'SKU', property: 'Material', type: 'string' },
            { label: 'PO#', property: 'PONumber', type: 'string' },
            { label: 'Item', property: 'Item', type: 'string' },
            { label: 'Balance', property: 'Balance', type: 'string' },
            { label: 'Doc date', property: 'PODate', type: 'string' },
            { label: 'Statistical delivery date', property: 'StatDelDate', type: 'string' },
            { label: 'Initial dates:', property: 'InitialDates', type: 'string' },
            { label: 'ODM CRD Mar 19', property: 'ODMCRDMar19', type: 'string' },
            { label: 'ODM Remark', property: 'ODMRemark', type: 'string' },
            { label: 'Harman Remark', property: 'HarmanRemark', type: 'string' },
            { label: 'Curr#', property: 'Currency', type: 'string' },
            { label: 'PO U/P', property: 'NetPrice', type: 'string' },
            { label: 'Order Status', property: 'ConfirmationCategory', type: 'string' },
            { label: 'Shipping mode', property: 'ShippingMode', type: 'string' },
            { label: 'Booking#', property: 'Booking', type: 'string' },
            { label: 'Ex-factory/CRD', property: 'ExFtCRD', type: 'string' },
            { label: 'Remark/Customer APAC', property: 'RemarkCustomerAPAC', type: 'string' },
            { label: 'Harman request Jun 7th', property: 'HarmanReqDate', type: 'string' },
            { label: 'ODM feedback Jun 10th', property: 'ODMFeedback', type: 'string' },
            { label: 'Seq Num', property: 'SequenceNumber', type: 'string' },
            { label: 'PO Qty', property: 'POQuantity', type: 'string' },
            { label: 'Qlik Qty', property: 'QlikQty', type: 'string' },
            { label: 'Qlik Date', property: 'QlikDate', type: 'string' },
            { label: 'Action Date', property: 'ActionDate', type: 'string' },
            { label: 'Email Flag', property: 'EmailFlag', type: 'string' },
            { label: 'EDI Flag', property: 'EDIFlag', type: 'string' },
            { label: 'Conf. Status', property: 'StatusFlag', type: 'string' },
            { label: 'Comment', property: 'RejectReason', type: 'string' },
            { label: 'Quantity', property: 'Quantity', type: 'string' },
            { label: 'Conf. Date', property: 'CreationDate', type: 'string' },
            
        ];


    var dNewDate = new Date().toLocaleString().replace(/[/\\:,]/g, "-");
    var sFileName = `BTP_Harman_POC_Template_${dNewDate}.xlsx`;
    var oSettings = {
        workbook: { columns: aCols },
        dataSource: flatExcelData,
        fileName: sFileName
    };

    if (!sGeneratedMsg.includes("No changes to save")) {
        var oSheet = new sap.ui.export.Spreadsheet(oSettings);
        oSheet.build().finally(function () {
            oSheet.destroy();
        });
    }

    this.onGenSaveMessage(sGeneratedMsg, treeData);
},
        onGenSaveMessage: function (sMsg,treeData) {
			MessageBox.success(sMsg, {
				actions: [MessageBox.Action.OK],
				emphasizedAction: MessageBox.Action.OK,
				onClose: function (sAction) {
					MessageToast.show(sMsg);    

                    const resetNewRecFlag = (data) => {
                        if (!Array.isArray(data)) return data; // Safety check
                        
                        data.forEach(record => {
                            if (record) {
                                record.newRecFlag = false;
                            }
                        });
                        
                        return data;
                    };
                    var aOldExcelList= resetNewRecFlag(treeData);
                    that.aOldData=JSON.parse(JSON.stringify(aOldExcelList));
                    that.aNewOldData=JSON.parse(JSON.stringify(aOldExcelList));
                    that.getView().getModel("excelModel").setProperty("/data",that.aNewOldData)
				},
				dependentOn: this.getView()
			});
		},
         // This function is called on the 'change' or 'liveChange' event of the input
        onQuantityLiveChange: function (oEvent) {
            const oInput = oEvent.getSource();
            const sNewValue = oEvent.getParameter("newValue");
            
            // 1. Force numeric inputs only
            var sFixedValue = sNewValue.replace(/[^0-9]/g, "");
            if (sNewValue !== sFixedValue) {
                oInput.setValue(sFixedValue);
            }

            const oContext = oInput.getBindingContext("excelModel");
            if (!oContext) {
                return;
            }

            const oModel = oContext.getModel("excelModel");
            const oCurrentItem = oContext.getObject();
            
            // Keys to identify matching line items
            const sTargetPONumber = oCurrentItem.PONumber;
            const sTargetItem = oCurrentItem.Item; 
            const fPOQuantity = parseFloat(oCurrentItem.POQuantity || 0);

            // 2. Get all rows from the flat array model data
            // Assuming your data is bound directly to the root "/" of the model
            const aAllItems = oModel.getProperty("/data") || [];

            // 3. Calculate sum of 'Quantity' for all items sharing same PO and Item
            let fTotalConfirmedQty = 0;

            aAllItems.forEach((item) => {
                // Match items with the exact same PO Number and Line Item
                if (item.PONumber === sTargetPONumber && item.Item === sTargetItem) {
                    
                    // Check if this is the exact row currently being edited
                    // (We compare the object references to find the active editing line)
                    if (item === oCurrentItem) {
                        fTotalConfirmedQty += parseFloat(sFixedValue || 0);
                    } else {
                        fTotalConfirmedQty += parseFloat(item.Quantity || 0);
                    }
                }
            });

            // 4. Validation Check
            const bIsOverLimit = fTotalConfirmedQty > fPOQuantity;
            const sState = bIsOverLimit ? "Error" : "None";
            const sMessage = bIsOverLimit ? "The sum of Confirmation quantity exceeds the PO line quantity" : "";

            // 5. Update UI state across the visible rows
            // Instead of querying table rows via hardcoded cell indices, we find matching contexts.
            const oTable = oInput.getParent().getParent(); // Adjust if table is deeper nested
            const aRows = oTable.getRows ? oTable.getRows() : [];

            aRows.forEach(oRow => {
                const oRowContext = oRow.getBindingContext("excelModel");
                if (oRowContext) {
                    const oRowData = oRowContext.getObject();
                    
                    // If the rendered row belongs to the same PO item group, sync its error state
                    if (oRowData.PONumber === sTargetPONumber && oRowData.Item === sTargetItem) {
                        // Safely search for the Input control inside this row's cells
                        const oQuantityInput = oRow.getCells().find(oCell => {
                            if (oCell.getMetadata().getName() === "sap.m.Input") {
                                const oBinding = oCell.getBinding("value");
                                // Check if this input is bound to the 'Quantity' property in your model
                                return oBinding && oBinding.getPath() === "Quantity";
                            }
                            return false;
                        });

                        // Apply the validation state to the correct input field
                        if (oQuantityInput) {
                            oQuantityInput.setValueState(sState);
                            oQuantityInput.setValueStateText(sMessage);
                        }
                    }
                }
            });
        },
        onDateLiveChange: function (oEvent) {
            const oDP = oEvent.getSource();
            const oModel = this.getView().getModel("excelModel");
            const oContext = oDP.getBindingContext("excelModel");
            const sNewDateValue = oEvent.getParameter("value");

            if (!sNewDateValue) return;

            // 1. Navigate to Parent Delivery Date
            const sPath = oContext.getPath();
            // const sParentPath = sPath.substring(0, sPath.lastIndexOf("/children/"));
            const sParentDateStr = oModel.getProperty(sPath + "/HarmanReqDate");

            const dParent = new Date(sParentDateStr);
            const dChild = new Date(sNewDateValue);

            // 2. Calculate Day Difference
            const iDiffInMs = Math.abs(dChild - dParent);
            const iDiffInDays = iDiffInMs / (1000 * 60 * 60 * 24);

            // 3. Determine State
            const sState = (iDiffInDays <= 5) ? "Success" : "Error";
            const sMsg = (iDiffInDays <= 5) ? "Dates are within the allowed 5-day window" : "Dates fall outside the allowed 5-day window";

            // 4. Update the Model
            oModel.setProperty(sPath + "/DateState", sState);
            oModel.setProperty(sPath + "/DateMsg", sMsg);
        },

        onShowExpanded:function(oEvent){

            if(this.lineItemFlag){
                let oSource=oEvent.getSource()
                let oBindingContext=oSource.getBindingContext("excelModel")
                let oPath=oBindingContext.getPath()
                let oPanelVisiblePath=oPath+"/PanelVisible"

                let bVisiblePath=this.getOwnerComponent().getModel("excelModel").getProperty(oPanelVisiblePath)
                if(bVisiblePath){
                    this.getOwnerComponent().getModel("excelModel").setProperty(oPanelVisiblePath,false)
                }else{
                    this.getOwnerComponent().getModel("excelModel").setProperty(oPanelVisiblePath,true)
                }
            }
            this.convertLIFlag(true)
        },
        convertLIFlag:function(bFlag){
            this.lineItemFlag=bFlag
        },
        convertSubLIFlag: function (bFlag) {
            this.sublineItemFlag = bFlag
        },
        onAddVendorRowSP: function (oEvent) {
            this.convertLIFlag(false);
            this.convertSubLIFlag(false);
            
            var oButton = oEvent.getSource();
            var oContext = oButton.getBindingContext("excelModel");
            var oModel = this.getOwnerComponent().getModel("excelModel");
            
            this.sCurrentPath = oContext.getPath();
            var oPOConfTable = oModel.getProperty('/data');
            var oVendorObject = oModel.getProperty(this.sCurrentPath);

            var sTargetPO = oContext.getObject().PONumber;
            var sTargetItem = oContext.getObject().Item;

            // 1. Find max sequence number
            const oFConfTable = oPOConfTable
                .filter(row => row.PONumber === sTargetPO && row.Item === sTargetItem)
                .map(row => Number(row.SequenceNumber));
                
            const maxSequence = oFConfTable.length > 0 ? Math.max(...oFConfTable) : 0;
            console.log(`Max Sequence Number for Item ${sTargetItem}:`, maxSequence);

            const iNewSNum = (maxSequence + 1).toString();  

            // 2. Build the new row object
            var oPushConfItem = {
                // Level 1
                VendorCode: oVendorObject.VendorCode,
                ODM: oVendorObject.ODM,
                FactorySite: oVendorObject.FactorySite,
                Region: oVendorObject.Region,
                Project: oVendorObject.Project,
                PONumber: oVendorObject.PONumber,
                PODate: oVendorObject.PODate,

                // Level 2
                StatDelDate: oVendorObject.StatDelDate,
                InitialDates: oVendorObject.InitialDates,
                ODMCRDMar19: oVendorObject.ODMCRDMar19,
                ODMRemark: oVendorObject.ODMRemark,
                HarmanRemark: oVendorObject.HarmanRemark,
                Material: oVendorObject.Material,
                POQuantity: oVendorObject.POQuantity,
                NetPrice: oVendorObject.NetPrice,
                Currency: oVendorObject.Currency,
                Balance: oVendorObject.Balance,
                Plant: oVendorObject.Plant,

                // Level 3
                ConfirmationCategory: oVendorObject.ConfirmationCategory,
                ShippingMode: oVendorObject.ShippingMode,
                Booking: oVendorObject.Booking,
                ExFtCRD: oVendorObject.ExFtCRD,
                RemarkCustomerAPAC: oVendorObject.RemarkCustomerAPAC,
                HarmanReqDate: oVendorObject.HarmanReqDate,
                ODMFeedback: oVendorObject.ODMFeedback,
                Item: oVendorObject.Item,  
                SequenceNumber: iNewSNum,
                StatusFlag: "",
                RejectReason: "",
                ActionDate: "",
                EmailFlag: "",   
                EDIFlag: oVendorObject.EDIFlag,  
                QlikQty: oVendorObject.QlikQty,
                QlikDate: oVendorObject.QlikDate,
                Quantity: "0",
                CreationDate: oVendorObject?.CreationDate,
                newRecFlag: true,
                DateState: "None", 
                DateMsg: ""        
            };

            // Option A: If your table handles sorting automatically via JSONModel bindings, push is fine:
            // oPOConfTable.push(oPushConfItem);

            // Option B (Recommended): Insert the new row directly below the currently clicked row
            var sCurrentIndex = parseInt(this.sCurrentPath.split("/").pop(), 10);
            if (!isNaN(sCurrentIndex)) {
                oPOConfTable.splice(sCurrentIndex + 1, 0, oPushConfItem);
            } else {
                oPOConfTable.push(oPushConfItem); // Fallback
            }

            // 3. CRITICAL: Update model property path correctly and refresh the model

            var oSortConfTable= this.sortData(oPOConfTable);
            oModel.setProperty('/data', oSortConfTable);
            oModel.refresh(true); // Forces UI components bound to this model to re-render
        },
        onDeleteVendorTreeRow: function (oEvent) {
            var oModel = this.getOwnerComponent().getModel("excelModel");
            
            // This will now successfully retrieve the context passed via the ActionSheet
            var oContext = oEvent.getSource().getBindingContext("excelModel");
            if (!oContext) {
                sap.m.MessageToast.show("Error: Could not determine the selected row context.");
                return;
            }
            
            var sPath = oContext.getPath();
            
            sap.m.MessageBox.confirm("Are you sure you want to delete this item?", {
                title: "Confirm Deletion",
                onClose: function (oAction) {
                    if (oAction === sap.m.MessageBox.Action.OK) {
                        
                        this.convertLIFlag(false);
                        this.convertSubLIFlag(false);

                        // Find parent path and index
                        var iLastSlashIndex = sPath.lastIndexOf("/");
                        var sParentPath = sPath.substring(0, iLastSlashIndex);
                        var sIndex = sPath.substring(iLastSlashIndex + 1);
                        
                        // For ui.table / Tree structures, handles named property structures vs arrays safely
                        var aParentCollection = oModel.getProperty(sParentPath);
                        var iIndex = parseInt(sIndex, 10);

                        if (Array.isArray(aParentCollection) && !isNaN(iIndex)) {
                            // Remove the item from JSON array
                            aParentCollection.splice(iIndex, 1);
                            oModel.refresh(true);
                            
                            sap.m.MessageToast.show("Item deleted successfully");
                        } else if (aParentCollection && typeof aParentCollection === 'object' && isNaN(iIndex)) {
                            // Fallback for named object paths if ui.table is using object-based node mapping
                            delete aParentCollection[sIndex];
                            oModel.refresh(true);
                            
                            sap.m.MessageToast.show("Item deleted successfully");
                        } else {
                            sap.m.MessageToast.show("Error: Unable to modify data source.");
                        }
                    }
                }.bind(this)
            });
        },
        onRejectVendorTreeRow: function (oEvent) {
            this.convertLIFlag(false);
            this.convertSubLIFlag(false)
            var oResourceBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();
            var oModel = this.getOwnerComponent().getModel("excelModel");
            
            // Get the binding context of the row where the button was clicked
            var oContext = oEvent.getSource().getBindingContext("excelModel");
            var sRejPath = oContext.getPath();

            // Create a Dialog dynamically
            if (!this.oRejectDialog) {
                this.oRejectDialog = new sap.m.Dialog({
                    title: "Reject Record",
                    type: "Message",
                    content: [
                        new sap.m.Label({
                            text: "Please provide a reason for rejection:",
                            labelFor: "rejectionTextArea"
                        }),
                        new sap.m.TextArea("rejectionTextArea", {
                            width: "100%",
                            placeholder: "Enter reason here...",
                            rows: 4
                        })
                    ],
                    beginButton: new sap.m.Button({
                        type: "Emphasized",
                        text: "Confirm",
                        press: function () {
                            var sReason = sap.ui.getCore().byId("rejectionTextArea").getValue();
                            
                            if (!sReason) {
                                sap.m.MessageToast.show("Please enter a reason before submitting.");
                                return;
                            }

                            var sActivePath = this.oRejectDialog.data("activePath");

                            oModel.setProperty(sActivePath + "/StatusFlag", "R");
                            oModel.setProperty(sActivePath + "/EDIFlag", "A");
                            oModel.setProperty(sActivePath + "/RejectReason", sReason);
                            var oToday = new Date().toLocaleDateString(); 
                            oModel.setProperty(sActivePath + "/ActionDate", oToday);
                            oModel.refresh(true);
                            sap.m.MessageToast.show("Record rejected successfully.");
                            
                            // Close and clean up
                            this.oRejectDialog.close();
                            sap.ui.getCore().byId("rejectionTextArea").setValue(""); // Clear for next time
                        }.bind(this)
                    }),
                    endButton: new sap.m.Button({
                        text: "Cancel",
                        press: function () {
                            this.oRejectDialog.close();
                        }.bind(this)
                    })
                });
            }
            this.oRejectDialog.data("activePath", sRejPath);
            this.oRejectDialog.open();
        },
        onAcceptVendorTreeRow: function (oEvent) {
            this.convertLIFlag(false);
            this.convertSubLIFlag(false)
            var oResourceBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();
            var oModel = this.getOwnerComponent().getModel("excelModel");
            
            // Get the binding context of the row where the button was clicked
            var oContext = oEvent.getSource().getBindingContext("excelModel");
            var sAppPath = oContext.getPath();
            sap.m.MessageBox.confirm("Are you sure you want to approve this item?", {
                title: "Approve PO Item",
                onClose: function (oAction) {
                    if (oAction === sap.m.MessageBox.Action.OK) {
                        oModel.setProperty(sAppPath + "/StatusFlag", "A");
                        oModel.setProperty(sAppPath + "/EDIFlag", "A");
                        var oToday = new Date().toLocaleDateString(); 
                        oModel.setProperty(sAppPath + "/ActionDate", oToday);
                        oModel.refresh(true);
                        sap.m.MessageToast.show("Record approved successfully.");
                    }
                }.bind(this) // Crucial: bind 'this' so you can still access this.convertLIFlag
            });
        },
        _closeDialog: function () {
            if (this._pCompareDialog) {
                this._pCompareDialog.then(function (oDialog) {
                    oDialog.close();
                });
            }
        },
        // onConfirmationRowPress: function (oEvent) {   
        //     var oItem = oEvent.getSource();
        //     var oCtx  = oItem.getBindingContext("excelModel");
        //     var oModel=this.getOwnerComponent().getModel("excelModel")
        //     var oCPath=oCtx.getPath()+"/children"
        //     this.sCurrentPath=oCPath;
        //     var oExcelTabData=oCtx.getModel("excelData").getProperty(oCPath)
        //     var oSPJSONModel=new JSONModel(oExcelTabData)
        //     // this.getView().byId("idPOLIDataTable").bindItems(oCPath)
        //     this.getOwnerComponent().setModel(oSPJSONModel,"alSidePanel")
        // },
        onConfirmationRowPress: function (oEvent) {   
            // oEvent.cancelBubble()
            // oEvent.getParameter("event").stopPropagation();
            // 1. Get the current pressed row
            this.convertLIFlag(false)
            var oCurrentItem = oEvent.getSource();

            // 2. Manage the highlight logic
            if (this.prevRecord) {
                this.prevRecord.removeStyleClass("myCustomHighlight");
            }
            
            oCurrentItem.addStyleClass("myCustomHighlight");
            
            // 3. Store this item as the "previous" for the next time a row is pressed
            this.prevRecord = oCurrentItem;
            var oItem = oEvent.getSource();
            var oCtx  = oItem.getBindingContext("excelModel");
            var oModel = this.getOwnerComponent().getModel("excelModel");
            var oCPath = oCtx.getPath() + "/children";
            this.sCurrentPath = oCPath;
            var oExcelTabData = oModel.getProperty(oCPath);
            oExcelTabData.newRecFlag=false;
            var aCopiedData = JSON.parse(JSON.stringify(oExcelTabData));
            var oSPJSONModel = new JSONModel(aCopiedData);
            this.getOwnerComponent().setModel(oSPJSONModel, "alSidePanel");
        },
        onSubSubRowPress: function (oEvent) {
            this.convertLIFlag(false);
            this.convertSubLIFlag(false)
        },
        onCloseDialog: function () {
            if (this._oDialog) {
                this._oDialog.close();
            }
        },
        getChangeSummary:function(originalData, currentData) {
            let updatedCount = 0;
            let addedCount = 0;

            const oldRecords = originalData;
            const newRecords = currentData ;

            newRecords.forEach(newRec => {
                // 1. Check if it's a brand new record
                if (newRec.newRecFlag === true) {
                    addedCount++;
                } else {
                    // 2. Check if an existing record was modified
                    // Find the matching record in the original snapshot by SequenceNumber
                    // const oldRec = oldRecords.find(r => r.SequenceNumber === newRec.SequenceNumber);
                    const oldRec = oldRecords.find(r =>   
                        r.SequenceNumber == newRec.SequenceNumber &&
                        r.Item     == newRec.Item     &&
                        r.VendorCode     == newRec.VendorCode     &&
                        r.PONumber       == newRec.PONumber
                    )
                                        
                    if (oldRec) {
                        // Compare relevant fields (Quantity, DeliveryDate, etc.)
                        // We stringify to do a quick "dirty" deep comparison
                        if (JSON.stringify(oldRec) !== JSON.stringify(newRec)) {
                            updatedCount++;
                        }
                    }
                }
            });

             
            let sResMessage=this.generateMessage(addedCount, updatedCount);
            return sResMessage;
        },

        generateMessage:function(added, updated) {
            if (added === 0 && updated === 0) return "No changes to save.";
            
            let msg = "Your data has been saved";
            let details = [];
            
            if (updated > 0) details.push(`${updated} record${updated > 1 ? 's' : ''} updated`);
            if (added > 0) details.push(`${added} record${added > 1 ? 's' : ''} added`);
            
            return `${msg}, ${details.join(", ")}`;
        },
        handlePopoverPress: function (oEvent) {
             this.convertLIFlag(false);
            this.convertSubLIFlag(false);
            var oButton = this.oCurrBtn,
                oView = this.getView(),
                // Capture the specific row context from the clicked button
                oContext = oButton.getBindingContext("excelModel");

            // Create popover if it doesn't exist
            if (!this._pPopover) {
                this._pPopover = sap.ui.core.Fragment.load({
                    id: oView.getId(),
                    name: "com.sap.poexcel.view.fragments.CommentPopover",
                    controller: this
                }).then(function (oPopover) {
                    oView.addDependent(oPopover);
                    return oPopover;
                });
            }

            this._pPopover.then(function (oPopover) {
                // Bind the popover to the specific row's context
                oPopover.setBindingContext(oContext, "excelModel");
                oPopover.openBy(oButton);
            });
        },
        handleQlikPopoverPress: function (oEvent) {
             this.convertLIFlag(false);
            this.convertSubLIFlag(false)
            var oButton = that.oCurrBtn,
                oView = this.getView(),
                // Capture the specific row context from the clicked button
                oContext = oButton.getBindingContext("excelModel");

            // Create popover if it doesn't exist
            if (!this._pqPopover) {
                this._pqPopover = sap.ui.core.Fragment.load({
                    id: oView.getId(),
                    name: "com.sap.poexcel.view.fragments.QlikCommentPopover",
                    controller: this
                }).then(function (oPopover) {
                    oView.addDependent(oPopover);
                    return oPopover;
                });
            }

            this._pqPopover.then(function (oPopover) {
                // Bind the popover to the specific row's context
                oPopover.setBindingContext(oContext, "excelModel");
                oPopover.openBy(oButton);
            });
        },

        onClosePopover: function() {
            this._pPopover.then(function(oPopover) {
                oPopover.close();
            });
        },
        onCloseQlikPopover: function () {
            this._pqPopover.then(function (oPopover) {
                oPopover.close();   
            });
        },

        _loadExternalLibrary: function (sUrl) {
            return new Promise(function (resolve, reject) {
                // If already loaded, resolve immediately
                if (window.XLSX) {
                    resolve();
                    return;
                }

                var script = document.createElement('script');
                script.type = 'text/javascript';
                script.src = sUrl;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }
    });
});