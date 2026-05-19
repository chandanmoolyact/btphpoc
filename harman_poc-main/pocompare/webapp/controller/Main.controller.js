sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/export/Spreadsheet",
    "com/sap/pocompare/model/formatter",
    "sap/ui/core/Fragment"
], (Controller,JSONModel,MessageToast,MessageBox,Spreadsheet,formatter,Fragment) => {
    "use strict";
    var that=this;

    return Controller.extend("com.sap.pocompare.controller.Main", {
        formattter:formatter,
        onInit() {
            // Initialize the model that will hold our Excel data
            var oModel = new JSONModel({
                data: []
            });
            this.getOwnerComponent().setModel(oModel, "excelModel");
            // this._headerFB=this.getView().byId("idHeaderFB")
            // this._headerFB.setVisible(false)
        },

        // Triggered when a file is selected via the FileUploader
        onFileChange: function (oEvent) {
            var aFiles = oEvent.getParameter("files");
            
            if (aFiles && aFiles.length > 0) {
                var oFile = aFiles[0];
                this._loadExternalLibrary("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js").then(function() {
                    this._readExcel(oFile);
                }.bind(this))
                .catch(function() {
                    sap.m.MessageToast.show("Failed to load the Excel library from CDN.");
                });
            }
        },

        // Allows the user to reset the view
        onClearFile: function () {
            this.byId("excelUploader").clear();
            this.getView().getModel("excelModel").setProperty("/data", []);
            // this._headerFB.setVisible(false)
        },

        // Helper function using SheetJS (XLSX)
        _readExcel: function (file) {
            var that = this;
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

                // VALIDATION: Check if every required header exists in the uploaded file
                // var bIsValid = REQUIRED_HEADERS.every(function (header) {
                //     return headers.includes(header);
                // });

                // if (!bIsValid) {
                //     that.onClearFile();
                //     MessageBox.error("Incorrect Template. Please use the official template with the correct columns");
                //     return;  
                // }

                // Convert to JSON
                var jsonData = XLSX.utils.sheet_to_json(worksheet, {
                    raw: false,
                    dateNF: 'yyyy-mm-dd'
                });

                // Map columns
                var formattedData = jsonData.map(function(row) {
                    return {
                        Vendor: row["Vendor"],
                        VendorCode: row["Vendor Code"],
                        VendorName: row["Vendor Name"],
                        Material: row["Material"],
                        MaterialDesc: row["Material Desc"],
                        PONumber: row["PO Number"] || row["PONumber"]||row["PO/PR No."],
                        LineItem: row["Line Item"] || row["LineItem"],
                        Quantity: row["Quantity"],
                        DocumentDate: new Date(row["Document Date"])?.toISOString()?.split('T')[0],
                        ScheduleLineCategory:row["Schedule Line Category"],
                        StatusCode:"1",
                        Status:"New",
                        StatusState:formatter.stateFormatter("1"),
                        StatusMsg:formatter.statusDescription("1"),
                        PanelVisible:false,
                        DeliveryDate: new Date(row["Delivery Date"])?.toISOString()?.split('T')[0]
                    };
                });

                let newData= that.transformDataForTreeTable(formattedData)

                that.getOwnerComponent().getModel("excelModel").setProperty("/data", newData);
                // that._headerFB.setVisible(true)
                MessageToast.show("Excel loaded for preview.");
            };

            reader.onerror = function (ex) {
                MessageBox.error("Error reading the Excel file.");
            };

            reader.readAsBinaryString(file);
        },


        transformDataForTreeTable:function(rawJsonString) {
            const flatData = rawJsonString;
            const groupedData = {};

            flatData.forEach((item, index) => {
                // Extract delivery date safely
                const deliveryDate = item.DeliveryDate

                // Create a unique key for the first hierarchy level
                const groupKey = `${item.PONumber}_${item.VendorCode}_${deliveryDate}`;

                // LEVEL 1: Initialize the group if it doesn't exist
                if (!groupedData[groupKey]) {
                    groupedData[groupKey] = {
                        PONumber: item.PONumber,
                        VendorCode: item.VendorCode,
                        VendorName: item.VendorName,
                        PanelVisible: item.PanelVisible,
                        DocumentDate: item.DocumentDate,
                        // Setting up the array for the next hierarchy level
                        children: [] 
                    };
                }

                // LEVEL 2: Create the line item
                // Note: Mocking 'LineItemNumber' and 'Quantity' as they are missing in the source
                const lineItemNum = (groupedData[groupKey].children.length + 1) * 10; 
                
                const level2Node = {
                    LineItemNumber: lineItemNum.toString(),
                    Material: item.Material,
                    Quantity: "1", // Mocked quantity
                    DeliveryDate: item.DeliveryDate,
                    NextPanelVisible:false,
                    children: []
                };

                // LEVEL 3: Create the exact replica of Level 2 (without further children to avoid infinite loops)
                const level3Node = {
                    LineItemNumber: level2Node.LineItemNumber,
                    Material: level2Node.Material,
                    Quantity: level2Node.Quantity,
                    DeliveryDate: level2Node.DeliveryDate,
                    Status:1,
                    StatusState:formatter.stateFormatter("1"),
                    StatusMsg:formatter.statusDescription("1")
                };

                // Push level 3 into level 2
                level2Node.children.push(level3Node);

                // Push level 2 into level 1
                groupedData[groupKey].children.push(level2Node);
            });

            // Convert the grouped object back into an array for the UI5 JSONModel
            return Object.values(groupedData);
        },

        // Triggered on Submit
        onSubmitData: function () {
            var that=this
            const oExcelModel = this.getOwnerComponent().getModel("excelModel");
            var aData = oExcelModel.getProperty("/data");

            if (!aData || aData.length === 0) {
                MessageBox.warning("No data to submit.");
                return;
            }

            var oPayload = { items: aData };

            MessageBox.success("Data submitted. Any mismatches will be routed for manager approval.", {
				actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
				emphasizedAction: MessageBox.Action.OK,
				onClose: function (sAction) {
					// MessageToast.show("Action selected: " + sAction);
                    that.onClearFile();

				},
				dependentOn: this.getView()
			});
        },
        onDownloadTemplate: function () {
            // Fetch the specific column configuration for the PO template
            var aCols = this._createColumnConfig();

            // Configure the export settings
            var oSettings = {
                workbook: {
                    columns: aCols
                },
                dataSource: [], 
                fileName: 'PO_Template.xlsx',
                worker: false 
            };

            // Generate and trigger the download of the spreadsheet
            var oSheet = new Spreadsheet(oSettings);
            oSheet.build().finally(function() {
                oSheet.destroy();
            });
        },
        onSaveTemplate: function (oEvent) {
            var treeData = this.getView().getModel("excelModel").getProperty("/data");
            var flatExcelData = this.transformTreeToFlatData(treeData);

            // 2. Define your Excel columns
            var aCols = [
                { label: 'PO Number', property: 'PONumber', type: 'string' },
                { label: 'Vendor Code', property: 'VendorCode', type: 'string' },
                { label: 'Vendor Name', property: 'VendorName', type: 'string' },
                { label: 'Item No.', property: 'LineItemNumber', type: 'string' },
                { label: 'Material', property: 'Material', type: 'string' },
                { label: 'Quantity', property: 'Quantity', type: 'string' },
                { label: 'Delivery Date', property: 'DeliveryDate', type: 'string' },
                { label: 'Document Date', property: 'DocumentDate', type: 'string' },
                { label: 'Status', property: 'Status', type: 'string' },
                { label: 'StatusMsg', property: 'StatusMsg', type: 'string' },
            ];

            var aCols = [
                // Level 1
                { label: 'Vendor Code', property: 'VendorCode', type: 'string' },
                { label: 'Vendor name', property: 'VendorName', type: 'string' },
                { label: 'PO Number', property: 'PONumber', type: 'string' },
                { label: 'PO date', property: 'PODate', type: 'string' },

                // Level 2
                { label: 'PO Line Item', property: 'POLineItem', type: 'string' },
                { label: 'Material', property: 'Material', type: 'string' },
                { label: 'Material Description', property: 'MaterialDesc', type: 'string' },
                { label: 'PO Quantity', property: 'POQuantity', type: 'string' },
                { label: 'Unit of Measure', property: 'UOM', type: 'string' },
                { label: 'Delivery Date', property: 'DeliveryDate', type: 'string' },
                { label: 'Net Price', property: 'NetPrice', type: 'string' },
                { label: 'Currency', property: 'Currency', type: 'string' },
                { label: 'Per', property: 'Per', type: 'string' },
                { label: 'Material Group', property: 'MaterialGroup', type: 'string' },
                { label: 'Plant', property: 'Plant', type: 'string' },
                { label: 'Storage Location', property: 'StorageLocation', type: 'string' },

                // Level 3
                { label: 'Confirmation category', property: 'ConfirmationCategory', type: 'string' },
                { label: 'Fdelivery Date Category', property: 'FDDCategory', type: 'string' },
                { label: 'Quantity', property: 'Quantity', type: 'string' },
                { label: 'Reference', property: 'Reference', type: 'string' },
                { label: 'Created on Date', property: 'CreationDate', type: 'string' },
                { label: 'Inbound Delivery', property: 'InboundDelivery', type: 'string' },
                { label: 'Item', property: 'Item', type: 'string' },
                { label: 'Higher Level Item', property: 'HLItem', type: 'string' },
                { label: 'Batch', property: 'Batch', type: 'string' },
                { label: 'Quantity Reduced', property: 'QtyReduced', type: 'string' },
                { label: 'MRP relevant', property: 'MRPRelevant', type: 'string' },
                { label: 'MPN Material', property: 'MRPMaterial', type: 'string' },
                { label: 'Creation Indicator', property: 'CreationIndicator', type: 'string' },
                { label: 'Sequence Number', property: 'SequenceNumber', type: 'string' }
            ];

            // 3. Configure and start the export
            var oSettings = {
                workbook: { columns: aCols },
                dataSource: flatExcelData,
                fileName: 'BTP_HAr.xlsx'
            };

            var oSheet = new Spreadsheet(oSettings);
            oSheet.build().finally(function() {
                oSheet.destroy();
            });
            
        },
        transformTreeToFlatData:function(treeData) {
            const flatData = [];

            // Loop through Level 1 (The PO / Vendor groups)
            treeData.forEach(groupNode => {
                // Extract the parent-level data
                const poNumber = groupNode.PONumber;
                const vendorCode = groupNode.VendorCode;
                const vendorName = groupNode.VendorName;
                const docDate = groupNode.DocumentDate;

                // Check if this group has children (Level 2 Line Items)
                if (groupNode.children && groupNode.children.length > 0) {
                    
                    // Loop through Level 2
                    groupNode.children.forEach(itemNode => {
                        
                        // Reconstruct the flat object
                        // You can add or modify properties here based on exactly what columns 
                        // you want your downloaded Excel file to have.
                        if (itemNode.children && itemNode.children.length > 0) {
                    
                            // Loop through Level 3
                            itemNode.children.forEach(subItemNode => {
                                
                                // Reconstruct the flat object
                                // You can add or modify properties here based on exactly what columns 
                                // you want your downloaded Excel file to have.
                                const flatRow = {
                                    PONumber: poNumber,
                                    VendorCode: vendorCode,
                                    VendorName: vendorName,
                                    LineItemNumber: itemNode.LineItemNumber,
                                    Material: itemNode.Material,
                                    Quantity: subItemNode.Quantity,
                                    DeliveryDate: subItemNode.DeliveryDate,
                                    DocumentDate:docDate,
                                    Status:subItemNode.Status,
                                    StatusMsg:subItemNode.StatusMsg
                                    // StatusState:formatter.StatusState
                                };
                                
                                // Push the flattened row to our new array
                                flatData.push(flatRow);
                            });
                        }
                    });
                }
            });

            return flatData;
        },

        _createColumnConfig: function() {
            return [
                {
                    label: 'PO Number',
                    property: 'poNumber',
                    type: 'string', 
                    width: 20
                },
                {
                    label: 'Line Item',
                    property: 'lineItem',
                    type: 'string',
                    width: 20
                },
                {
                    label: 'Quantity',
                    property: 'quantity',
                    type: 'number',
                    width: 15
                },
                {
                    label: 'Delivery Date',
                    property: 'deliveryDate',
                    type: 'date',
                    format: 'yyyy-MM-dd', 
                    width: 20
                }
            ];
        },
        // --- NEW: Handle Row Click & Open Dialog ---
        onRowPress: async function (oEvent) {
            // var oView = this.getView();
            // // Get the specific data context of the row that was clicked
            // var oContext = oEvent.getSource().getBindingContext("excelModel");

            // // If the dialog hasn't been created yet, load it
            // if (!this._pCompareDialog) {
            //     this._pCompareDialog = await this.loadFragment({
            //         // id: oView.getId(),
            //         // Replace "com.sap.pocompare.view.fragments" with your actual path
            //         name: "com.sap.pocompare.view.fragments.sections.CompareDialog"
            //         // controller: this
            //     });
            //     oView.addDependent(this._pCompareDialog);
            // }

            // // Once the dialog is ready, bind the row context to it and open
            // this._pCompareDialog.setBindingContext(oContext, "excelModel");
            // this._pCompareDialog.open();
        },
        onShowExpanded:function(oEvent){
            let oSource=oEvent.getSource()
            let oBindingContext=oSource.getBindingContext("excelModel")
            let oPath=oBindingContext.getPath()
            let oPanelVisiblePath=oPath+"/PanelVisible"

            let bVisiblePath=this.getOwnerComponent().getModel("excelModel").getProperty(oPanelVisiblePath)
            if(bVisiblePath){
                this.getOwnerComponent().getModel("excelModel").setProperty(oPanelVisiblePath,false)
                oSource.setIcon("sap-icon://dropdown")
            }else{
             this.getOwnerComponent().getModel("excelModel").setProperty(oPanelVisiblePath,true)
             oSource.setIcon("sap-icon://slim-arrow-up")
            }
             
        },
        onSubShowExpanded:function(oEvent){
            let oSource=oEvent.getSource()
            let oBindingContext=oSource.getBindingContext("excelModel")
            let oPath=oBindingContext.getPath()
            let oPanelVisiblePath=oPath+"/NextPanelVisible"

            let bVisiblePath=this.getOwnerComponent().getModel("excelModel").getProperty(oPanelVisiblePath)
            if(bVisiblePath){
                this.getOwnerComponent().getModel("excelModel").setProperty(oPanelVisiblePath,false)
                oSource.setIcon("sap-icon://dropdown")
            }else{
             this.getOwnerComponent().getModel("excelModel").setProperty(oPanelVisiblePath,true)
             oSource.setIcon("sap-icon://slim-arrow-up")
            }
             
        },
        onAddVendorRow: function (oEvent) {
            var oButton = oEvent.getSource();
            var oContext = oButton.getBindingContext("excelModel");
            var sOuterRowPath = oContext.getPath(); // e.g., "/data/0"
            var oModel = this.getOwnerComponent().getModel("excelModel");
            var aVendorInputTable = oModel.getProperty(sOuterRowPath + "/children");
            var iLINumber;
            if(aVendorInputTable.length!=0){
                var iMaxTabLength=aVendorInputTable.length
                var iMaxLINumber=aVendorInputTable[iMaxTabLength-1].LineItemNumber
                iLINumber=(Number(iMaxLINumber)+10).toString()
            }else{
                iLINumber=10
            }
            aVendorInputTable.push({
                LineItemNumber: iLINumber,
                Quantity: 0,
                DeliveryDate: "",
                Status:1,
                StatusMsg:formatter.stateFormatter("1"),
                StatusState:formatter.statusDescription("1")
            });
            
            // 6. Update the model to trigger the UI refresh
            oModel.setProperty(sOuterRowPath + "/children", aVendorInputTable);
        },
        onAddVendorRowSP: function (oEvent) {
            var oButton = oEvent.getSource();
            var oContext = oButton.getBindingContext("alSidePanel");
            // var sOuterRowPath = oContext.getPath(); // e.g., "/data/0"
            var oModel = this.getOwnerComponent().getModel("excelModel");
            var oSPModel = this.getOwnerComponent().getModel("alSidePanel");
            var aVendorInputTable=oModel.getProperty(this.sCurrentPath)
            var iLINumber;
            if(aVendorInputTable.length!=0){
                var iMaxTabLength=aVendorInputTable.length
                var iMaxLINumber=aVendorInputTable[iMaxTabLength-1].LineItemNumber
                iLINumber=(Number(iMaxLINumber)+10).toString()
            }else{
                iLINumber=10
            }
            aVendorInputTable.push({
                LineItemNumber: iLINumber,
                Quantity: 0,
                DeliveryDate: "",
                Status:1,
                StatusMsg:formatter.statusDescription("1"),
                StatusState:formatter.stateFormatter("1")
            });
            oSPModel.setProperty("/",aVendorInputTable)
            // 6. Update the model to trigger the UI refresh
            oModel.setProperty(this.sCurrentPath, aVendorInputTable);
        },
        onDeleteVendorRow: function (oEvent) {
            // 1. Get the delete button that was clicked inside the inner table row
            var oButton = oEvent.getSource();
            
            // 2. Get the binding context for this specific INNER row
            var oContext = oButton.getBindingContext("excelModel");
            var sInnerRowPath = oContext.getPath(); 
            
            // 3. Get the model
            var oModel = this.getOwnerComponent().getModel("excelModel");
            var sParentArrayPath = sInnerRowPath.substring(0, sInnerRowPath.lastIndexOf("/")); 
            var sRowIndex = sInnerRowPath.substring(sInnerRowPath.lastIndexOf("/") + 1); 
            var aVendorInputTable = oModel.getProperty(sParentArrayPath);
            aVendorInputTable.splice(parseInt(sRowIndex, 10), 1); 
            
            oModel.setProperty(sParentArrayPath, aVendorInputTable);
        },
        onDeleteVendorRowSP: function (oEvent) {
            // 1. Get the delete button that was clicked inside the inner table row
            var oButton = oEvent.getSource();
            
            // 2. Get the binding context for this specific INNER row
            var oContext = oButton.getBindingContext("alSidePanel");
            var sInnerRowPath = oContext.getPath(); 
            
            // 3. Get the model
            var oModel = this.getOwnerComponent().getModel("excelModel");
            var oModelData = this.getOwnerComponent().getModel("excelModel").getProperty(this.sCurrentPath);
            var oSPModel = this.getOwnerComponent().getModel("alSidePanel");
            var oSPModelData = this.getOwnerComponent().getModel("alSidePanel").getProperty("/");
            // var sParentArrayPath = sInnerRowPath.substring(0, sInnerRowPath.lastIndexOf("/")); 
            // var sRowIndex = sInnerRowPath.substring(sInnerRowPath.lastIndexOf("/") + 1); 
            var aVendorInputTable = oSPModel.getProperty(sInnerRowPath);
            var iLINumber=aVendorInputTable?.LineItemNumber

            let iIndex = oModelData.findIndex(item => item.LineItemNumber == iLINumber);
            let iNewIndex = oSPModelData.findIndex(item => item.LineItemNumber == iLINumber);
            if (iIndex > -1) {
                oModelData.splice(iIndex, 1);
                // oSPModelData.splice(iNewIndex, 1);
                oModel.refresh(); 
                oSPModel.refresh(); 
            }
            // aVendorInputTable.splice(parseInt(sRowIndex, 10), 1); 
            
            // oModel.setProperty(this.sCurrentPath, oModelData);
            // oSPModel.setProperty(sInnerRowPath, oSPModelData);
        },

        // --- Dialog Actions ---
        onApprovePress: function (oEvent) {
            MessageToast.show("Line Item Approved!");
            this._closeDialog();
        },

        onRejectPress: function (oEvent) {
            MessageToast.show("Line Item Rejected!");
            this._closeDialog();
        },
        onActionTaken:function(oEvent){

            let sButtonText=oEvent.getSource().getText()



            var oButton = oEvent.getSource();
            var oContext = oButton.getBindingContext("alSidePanel");
            var sInnerRowPath = oContext.getPath();
        
            // 3. Get the model
            var oModel = this.getOwnerComponent().getModel("excelModel");
            var oSPModel = this.getOwnerComponent().getModel("alSidePanel");
            let sChangePropertyStatus=sInnerRowPath+"/Status"
            let sChangePropertyStatusMsg=sInnerRowPath+"/StatusMsg"
            let sChangePropertyStatusState=sInnerRowPath+"/StatusState"
            if(sButtonText=="Approve"){
                oSPModel.setProperty(sChangePropertyStatus,2);
                oSPModel.setProperty(sChangePropertyStatusMsg,formatter.statusDescription("2"));
                oSPModel.setProperty(sChangePropertyStatusState,formatter.stateFormatter("2"));
            }else if(sButtonText=="Reject"){
                oSPModel.setProperty(sChangePropertyStatus,3);
                oSPModel.setProperty(sChangePropertyStatusMsg,formatter.statusDescription("3"));
                oSPModel.setProperty(sChangePropertyStatusState,formatter.stateFormatter("3"));
            }
        },

        _closeDialog: function () {
            if (this._pCompareDialog) {
                this._pCompareDialog.then(function (oDialog) {
                    oDialog.close();
                });
            }
        },

        onConfirmationRowPress: function (oEvent) {   
            var oItem = oEvent.getSource();
            var oCtx  = oItem.getBindingContext("excelModel");
            var oModel=this.getOwnerComponent().getModel("excelModel")
            var oCPath=oCtx.getPath()+"/children"
            this.sCurrentPath=oCPath;
            var oExcelTabData=oCtx.getModel("excelData").getProperty(oCPath)
            var oSPJSONModel=new JSONModel(oExcelTabData)
            // this.getView().byId("idPOLIDataTable").bindItems(oCPath)
            this.getOwnerComponent().setModel(oSPJSONModel,"alSidePanel")
            
            // oModel.setProperty(oCPath, oExcelTabData);

            // if (!this._oDialog) {
            //     this._oDialog = this.byId("poDetailDialog");
            // }
            // this._oDialog.open();
        },

        onCloseDialog: function () {
            if (this._oDialog) {
                this._oDialog.close();
            }
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