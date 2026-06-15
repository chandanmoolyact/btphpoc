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
            // this.oAdaptFilterBtn=sap.ui.getCore().byId("container-com.sap.poexcel---First--idTreeFilterBar-btnFilters-content")
            // this.oAdaptFilterBtn.setVisible(false)
            this._injectL3ScrollStyles();
            this._patchL3ScrollDom();
        },
        onActionButtonPress: function (oEvent) {
            var oButton = oEvent.getSource();
			this.byId("actionSheet").openBy(oButton);
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
        // onSearchFilterBar: function () {
        //     var oModel = this.getView().getModel("excelModel");
            
        //     // 1. Keep a pristine copy of your original dataset
        //     if (!this._oOriginalData) {
        //         this._oOriginalData = JSON.parse(JSON.stringify(oModel.getProperty("/data")));
        //     }

        //     // 2. Extract active filter criteria from the FilterBar
        //     var oActiveFilters = {};
        //     this.oFilterBar.getFilterGroupItems().forEach(function (oItem) {
        //         var oControl = oItem.getControl();
        //         var sName = oItem.getName();
        //         var sClassName = oControl.getMetadata().getName();
                
        //         // --- A. Handle DateRangeSelection ---
        //         if (sClassName === "sap.m.DateRangeSelection") {
        //             var oDateStart = oControl.getDateValue();
        //             var oDateEnd = oControl.getSecondDateValue();
                    
        //             if (oDateStart && oDateEnd) {
        //                 var oStart = new Date(oDateStart); oStart.setHours(0,0,0,0);
        //                 var oEnd = new Date(oDateEnd); oEnd.setHours(23,59,59,999);
                        
        //                 oActiveFilters[sName] = {
        //                     isDateRange: true,
        //                     start: oStart.getTime(),
        //                     end: oEnd.getTime()
        //                 };
        //             }
        //         } 
        //         // --- B. Handle Select (Dropdown) ---
        //         else if (sClassName === "sap.m.Select") {
        //             var sSelectedKey = oControl.getSelectedKey();
        //             // Only add to active filters if a valid key is selected (ignores empty strings/default "Select All" keys)
        //             if (sSelectedKey && sSelectedKey !== "") {
        //                 oActiveFilters[sName] = {
        //                     isSelectKey: true,
        //                     value: sSelectedKey.trim() // Keep exact casing if needed, or handle matching below
        //                 };
        //             }
        //         } 
        //         // --- C. Handle Regular Inputs ---
        //         else {
        //             var sValue = oControl.getValue ? oControl.getValue() : null;
        //             if (sValue) {
        //                 oActiveFilters[sName] = sValue.toLowerCase().trim();
        //             }
        //         }
        //     });

        //     var aFilterKeys = Object.keys(oActiveFilters);

        //     // If no filters are filled out, instantly restore original tree and exit
        //     if (aFilterKeys.length === 0) {
        //         oModel.setProperty("/data", JSON.parse(JSON.stringify(this._oOriginalData)));
        //         return;
        //     }

        //     // 3. Deep evaluation function to ensure ALL active filter keys are satisfied in this branch
        //     function evaluateAndFilterTree(aNodes, aPendingKeys) {
        //         if (!aNodes || aNodes.length === 0) { return []; }

        //         return aNodes.map(function (oNode) {
        //             // Create a deep copy of the node so we don't manipulate the master array
        //             var oClonedNode = Object.assign({}, oNode);

        //             // Check which of the remaining filter keys match the current node level
        //             var aMatchedKeysAtThisLevel = aPendingKeys.filter(function (sKey) {
        //                 var filterConfig = oActiveFilters[sKey];
        //                 var nodeValue = oClonedNode[sKey];
                        
        //                 // If the node doesn't possess this property at its level, it can't match it here
        //                 if (nodeValue === undefined || nodeValue === null) { return false; }

        //                 // --- Handle Date Range Filter Type ---
        //                 if (filterConfig && filterConfig.isDateRange) {
        //                     var oNodeDate = new Date(nodeValue);
        //                     if (isNaN(oNodeDate.getTime())) { return false; }
                            
        //                     var iNodeTime = oNodeDate.getTime();
        //                     return iNodeTime >= filterConfig.start && iNodeTime <= filterConfig.end;
        //                 }

        //                 // --- Handle Select Dropdown Key Type ---
        //                 if (filterConfig && filterConfig.isSelectKey) {
        //                     // Direct strict comparison (or .toLowerCase() comparison if data values might mismatch in casing)
        //                     return String(nodeValue).trim() === filterConfig.value;
        //                 }

        //                 // --- Handle Regular String Filters ---
        //                 return String(nodeValue).toLowerCase().includes(filterConfig);
        //             });

        //             // Calculate remaining filter keys that still need to be satisfied by children
        //             var aRemainingKeys = aPendingKeys.filter(function (sKey) {
        //                 return !aMatchedKeysAtThisLevel.includes(sKey);
        //             });

        //             // If this node has sub-items (children), dig deeper with the remaining un-matched filters
        //             if (oClonedNode.children && oClonedNode.children.length > 0) {
        //                 var aFilteredChildren = evaluateAndFilterTree(oClonedNode.children, aRemainingKeys);
                        
        //                 if (aFilteredChildren.length > 0) {
        //                     oClonedNode.children = aFilteredChildren;
        //                     // Automatically keep hierarchy open to show where the matches occurred
        //                     oClonedNode.PanelVisible = true;
        //                     oClonedNode.NextPanelVisible = true;
                            
        //                     // If children successfully cleared out all remaining criteria, this node is valid!
        //                     return oClonedNode;
        //                 }
        //             }

        //             // If there are no children left, but we satisfied ALL active filters along this path:
        //             if (aRemainingKeys.length === 0) {
        //                 return oClonedNode;
        //             }

        //             return null; // Drop this node; it didn't fulfill the "AND" requirements
        //         }).filter(Boolean); // Clear out null entries
        //     }

        //     // 4. Run the data clone through the custom AND pipeline and update view
        //     var aDeepCopyOfData = JSON.parse(JSON.stringify(this._oOriginalData));
        //     var aFilteredData = evaluateAndFilterTree(aDeepCopyOfData, aFilterKeys);
            
        //     oModel.setProperty("/data", aFilteredData);

        //     this._injectL3ScrollStyles();
        //     this._patchL3ScrollDom();
        // },
        /**
         * CSS rules for L3 scroll styling and popin overflow.
         */
        _injectL3ScrollStyles: function () {
            // Remove old cached style tag if present so fresh rules apply
            var old = document.getElementById("poScrollStyles");
            if (old) old.remove();

            var s = document.createElement("style");
            s.id = "poScrollStyles";
            s.textContent = [
                /* Parent popin cells — don't clip the L3 scroll area */
                ".sapMListTblSubCnt .sapMPanel,",
                ".sapMListTblSubCnt .sapMPanelContent {",
                "  overflow:visible !important;",
                "  max-width:none !important;",
                "  padding:0 !important;",
                "  margin:0 !important;",
                "}",
                ".sapMListTblSubCnt {",
                "  overflow:visible !important;",
                "  padding-left:0 !important;",
                "  padding-right:0 !important;",
                "}",
                ".sapMListTblSubRow > td {",
                "  overflow:visible !important;",
                "  max-width:none !important;",
                "}"
            ].join("\n");
            document.head.appendChild(s);
        },

        /**
         * Finds every rendered .poL3Scroll DOM node and forces
         * display:block + overflow-x:auto via inline JS. Also walks up
         * from each L3 node and unlocks overflow-x on all ancestors
         * up to the popin row boundary.
         */
        _patchL3ScrollDom: function () {
            var nodes = document.querySelectorAll(".poL3Scroll");
            if (!nodes.length) return;

            // Inject a unique ID on each node so we can target it precisely
            var styleRules = [];
            nodes.forEach(function (el, i) {
                // Force scroll behaviour inline
                el.style.setProperty("display", "block", "important");
                el.style.setProperty("overflow-x", "auto", "important");
                el.style.setProperty("width", "100%", "important");
                el.style.setProperty("-webkit-overflow-scrolling", "touch");
                el.style.setProperty("scrollbar-width", "thin");
                el.style.setProperty("scrollbar-color", "#c49000 transparent");

                // Assign a unique ID for webkit scrollbar pseudo targeting
                var uid = "poL3Scroll_" + i;
                el.setAttribute("data-scrollid", uid);

                styleRules.push(
                    "[data-scrollid='" + uid + "']::-webkit-scrollbar { height:4px !important; }",
                    "[data-scrollid='" + uid + "']::-webkit-scrollbar-track { background:transparent !important; }",
                    "[data-scrollid='" + uid + "']::-webkit-scrollbar-thumb { background:#c49000 !important; border-radius:4px !important; min-width:30px !important; }",
                    "[data-scrollid='" + uid + "']::-webkit-scrollbar-thumb:hover { background:#9a7000 !important; }"
                );

                // Unlock overflow on ancestors up to popin row
                var parent = el.parentElement;
                var maxWalk = 10;
                while (parent && maxWalk-- > 0) {
                    var cls = parent.className || "";
                    if (cls.indexOf("sapMListTblSubRow") !== -1 ||
                        cls.indexOf("poHeaderTable") !== -1 ||
                        cls.indexOf("poLinesTable") !== -1) {
                        parent.style.setProperty("overflow-x", "visible", "important");
                        parent.querySelectorAll(":scope > td").forEach(function (td) {
                            td.style.setProperty("overflow", "visible", "important");
                            td.style.setProperty("max-width", "none", "important");
                        });
                        break;
                    }
                    var cs = window.getComputedStyle(parent);
                    if (cs.overflow === "hidden" || cs.overflowX === "hidden") {
                        parent.style.setProperty("overflow-x", "visible", "important");
                    }
                    if (cs.maxWidth && cs.maxWidth !== "none") {
                        parent.style.setProperty("max-width", "none", "important");
                    }
                    parent = parent.parentElement;
                }
            });

            // Inject/replace the scrollbar style rules
            var tag = document.getElementById("poL3ScrollbarStyle");
            if (!tag) {
                tag = document.createElement("style");
                tag.id = "poL3ScrollbarStyle";
                document.head.appendChild(tag);
            }
            tag.textContent = styleRules.join("\n");
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
                        //Level 1 Start
                        VendorCode: row["Vendor Code"]||row["vendor code"],
                        ODM:row["ODM"],
                        FactorySite:row["Factory site"],
                        Region:row["Region"],
                        Project:row["Project"],
                        VendorName: row["Vendor Name"]||row["Vendor name"],
                        PONumber: row["PO Number"] || row["PONumber"]||row["PO#"],
                        PODate: formatDate(row["PO date"])||formatDate(row["Doc date"]),
                        PanelVisible:false,
                        //Level 2 Start
                        StatDelDate: row["Statistical delivery date"]||row["Statistical Delivery Date"],
                        InitialDates: row["Initial dates:"]||row["Initial dates:"],
                        ODMCRDMar19: row["ODM CRD Mar 19"]||row["ODM CRD Mar 19"],
                        ODMRemark: row["ODM Remark"]||row["ODM Remark"],
                        HarmanRemark: row["Harman Remark"]||row["Harman Remark"],
                        POLineItem: row["PO Line Item"] || row["LineItem"],
                        Material: row["Material"]||row["SKU"],
                        MaterialDesc: row["Material Description"],
                        POQuantity: row["PO Qty"]||row["PO Quantity"],
                        UOM: row["Unit of Measure"],
                        DeliveryDate: formatDate(row["Delivery Date"]) ||formatDate(row["Harman request Jun 7th"]),
                        NetPrice: row["Net Price"]||row["PO U/P"],
                        Currency: row["Currency"]||row["Curr#"],
                        Balance: row["Balance"],
                        Per: row["Per"],
                        MaterialGroup: row["Material Group"],
                        Plant : row["Plant"],
                        StorageLocation : row["Storage Location"],
                        //Level 3 Start
                        ConfirmationCategory:row["Confirmation category"]||row["Order Status"],
                        ShippingMode:row["Shipping mode"]||row["Shipping Mode"],
                        FDDCategory: row["Fdelivery Date category"] || row["FDelivery Date Category"] || row["Delivery Date Category"],
                        Quantity: row["Quantity"],
                        Booking: row["Booking#"],
                        ExFtCRD: row["Ex-factory/CRD"],
                        RemarkCustomerAPAC: row["Remark/Customer APAC"],
                        HarmanReqDate: row["Harman request Jun 7th"],
                        ODMFeedback: row["ODM feedback Jun 10th"],
                        // 
                        Reference: row["Reference"],
                        CreationDate: formatDate(row["Created on Date"]),
                        InboundDelivery: row["Inbound Delivery"],
                        Item: row["Item"],
                        HLItem: row["Higher Level Item"],
                        Batch: row["Batch"],
                        QtyReduced: row["Quantity Reduced"],
                        MRPRelevant: row["MRP relevant"]||row["MRP Relevent"],
                        MRPMaterial: row["MPN Material"]||row["MPN material"],
                        CreationIndicator: row["Creation Indicator"]||row["Creation Indicator"],
                        SequenceNumber: row["Sequence Number"]||row["Sequence number"]||row["Seq Num"],
                        StatusFlag: row["Status"],
                        RejectReason: row["Comment"],
                        ActionDate: formatDate(row["Action Date"]),
                        EmailFlag: row["Email Flag"]||row["EmailFlag"],   
                        EDIFlag: row["EDI Flag"]||row["EDIFlag"],  
                        QlikQty: row["Qlik Qty"] || row["QLIK Qty"],
                        QlikDate: formatDate(row["Qlik Date"] || row["QLIK Date"]),
                        DateState: "None",
                        DateMsg: "",
                        // These are the properties our validation logic uses!
                        //Status 4
                    };
                });

                const valueHelpData=that.getUniqueValueHelpDesc(formattedData);
                const oValueHelpModel = new JSONModel(valueHelpData);
                that.getOwnerComponent().setModel(oValueHelpModel, "valueHelpModel");

                // let newData= that.transformDataForTreeTable(formattedData)
                // let aDateNewData=that._processData(newData)
                // that.aOldData = JSON.parse(JSON.stringify(aDateNewData));  

                that.getOwnerComponent().getModel("excelModel").setProperty("/data", formattedData);

                // that._headerFB.setVisible(true)
                MessageToast.show("Excel loaded for preview.");
                setTimeout(function () { that._patchL3ScrollDom(); }, 300);
            };
            reader.onerror = function (ex) {
                MessageBox.error("Error reading the Excel file.");
            };
            reader.readAsBinaryString(file);
        },
        transformDataForTreeTable: function(rawJsonString) {
            const flatData = rawJsonString;
            const groupedData = {};
            flatData.forEach((item) => {
                // ==========================================
                // LEVEL 1: Header Level Grouping
                // Key based on PONumber, VendorCode, VendorName, PODate
                // ==========================================
                const level1Key = `${item.PONumber}_${item.VendorCode}_${item.VendorName}_${item.PODate}`;
                // Initialize the Level 1 group if it doesn't exist
                if (!groupedData[level1Key]) {
                    groupedData[level1Key] = {
                        PONumber: item.PONumber,
                        VendorCode: item.VendorCode,
                        VendorName: item.VendorName,
                        PODate: item.PODate,
                        PanelVisible: item.PanelVisible,
                        DocumentDate: item.DocumentDate,
                        EDIHFlag: item.EDIFlag,
                        // We use a temporary map to easily group Level 2 items without duplicating them
                        _level2ItemsMap: {}, 
                        children: [] 
                    };
                }
                // ==========================================
                // LEVEL 2: Line Item Level Grouping
                // Key based on POLineItem (to group multiple sequences under one line)
                // ==========================================
                const level2Key = `${item.POLineItem}`;
                // Initialize Level 2 if it doesn't exist under this specific Level 1 node
                if (!groupedData[level1Key]._level2ItemsMap[level2Key]) {
                    groupedData[level1Key]._level2ItemsMap[level2Key] = {
                        // Showing upper-level fields + Line item info
                        PONumber: item.PONumber,
                        VendorCode: item.VendorCode,
                        VendorName: item.VendorName,
                        PODate: item.PODate,
                        POLineItem: item.POLineItem, // Using actual PO Line Item instead of mock
                        Material: item.Material,
                        MaterialDesc: item.MaterialDesc,
                        POQuantity: item.POQuantity,
                        UOM: item.UOM,
                        NetPrice: item.NetPrice,
                        Currency: item.Currency,
                        Per: item.Per,
                        MaterialGroup: item.MaterialGroup,
                        Plant : item.Plant,
                        StorageLocation : item.StorageLocation,
                        NextPanelVisible: false,
                        DeliveryDate: item.DeliveryDate,
                        EDILIFlag: item.EDIFlag,
                        children: [] // This will hold the Level 3 sequences

                    };
                }
                // ==========================================
                // LEVEL 3: Sequence Level Details
                // ==========================================
                const level3Node = {
                    PONumber: item.PONumber, 
                    VendorCode: item.VendorCode,
                    VendorName: item.VendorName,
                    PODate: item.PODate,
                    POLineItem: item.POLineItem,
                    SequenceNumber: item.SequenceNumber, // The differentiator for Level 3
                    DeliveryDate: item.DeliveryDate,
                    ConfirmationCategory: item.ConfirmationCategory,
                    FDDCategory: item.FDDCategory,
                    Quantity: item.Quantity,
                    Reference: item.Reference,
                    CreationDate: item.CreationDate,
                    InboundDelivery: item.InboundDelivery,
                    Item: item.Item,
                    HLItem: item.HLItem,
                    Batch: item.Batch,
                    QtyReduced: item.QtyReduced,
                    MRPRelevant: item.MRPRelevant,
                    MRPMaterial: item.MRPMaterial,
                    CreationIndicator: item.CreationIndicator,
                    newRecFlag:false,
                    StatusFlag:item.StatusFlag,
                    RejectReason:item.RejectReason,
                    QlikQty: item.QlikQty,
                    QlikDate: item.QlikDate,
                    ActionDate:item.ActionDate,   
                    EDIFlag:item.EDIFlag,   
                    DateState: "None",
                    DateMsg: "",
                    EmailFlag: item.EmailFlag
                };
                // Push the Level 3 detail into the correct Level 2 node's children array
                groupedData[level1Key]._level2ItemsMap[level2Key].children.push(level3Node);
            });
            // ==========================================
            // FINAL CLEANUP: Convert Maps back to Arrays
            // ==========================================
            // UI5 JSONModels need standard arrays for "children", not object maps.
            const treeData = Object.values(groupedData).map(level1Node => {
                // Extract Level 2 items from the temporary map into the children array
                level1Node.children = Object.values(level1Node._level2ItemsMap);
                // Remove the temporary map so it doesn't clutter your UI5 model
                delete level1Node._level2ItemsMap; 
                return level1Node;
            });

            return treeData;
        },
         _processData: function (aData) {
            aData.forEach(level1 => {
                if (level1.children) {
                    level1.children.forEach(level2 => {
                        if (level2.children) {
                            level2.children.forEach(level3 => {
                                // 1. Get the dates
                                const oDelDate = new Date(level3.DeliveryDate);
                                const oCreDate = new Date(level3.CreationDate);

                                // 2. Calculate the difference in time
                                const iDiffInTime = oCreDate.getTime() - oDelDate.getTime();
                                
                                // 3. Convert time to days
                                const iDiffInDays = iDiffInTime / (1000 * 3600 * 24);

                                // 4. Check logic: +- 5 days
                                if (Math.abs(iDiffInDays) <= 5) {
                                    level3.DateState = "Success"; // Green
                                    level3.DateMsg = "Dates are within the allowed 5-day window";
                                } else {
                                    level3.DateState = "Error";   // Red
                                    level3.DateMsg = "Dates fall outside the allowed 5-day window";
                                }
                            });
                        }
                    });
                }
            });
            return aData;
        },
        onDownloadTemplate: function () {
        },
        // onSaveTemplate: async function (oEvent) {
        //     var treeData = this.getView().getModel("excelModel").getProperty("/data");



        //     var oCAPModel = this.getOwnerComponent().getModel("capService"); 
        //     var oActionContext = oCAPModel.bindContext("/sendMailContent(...)");
        //     // oActionContext.setParameter("poHeader", JSON.stringify(treeData));
        //     oActionContext.setParameter("poHeader", treeData);
        //     try{
        //         var oResults=await oActionContext.execute()
        //         treeData=oActionContext.getBoundContext().getObject().value[0]?.data
        //         console.log(oResults)
        //     }catch(oError){
        //         console.log(oError)
        //     }
        //     var flatExcelData = this.transformTreeToFlatData(treeData);
        //     var sGeneratedMsg=this.getChangeSummary(this.aOldData,treeData)

        //     var aCols = [
        //         // Level 1
        //         { label: 'Vendor Code', property: 'VendorCode', type: 'string' },
        //         { label: 'Vendor name', property: 'VendorName', type: 'string' },
        //         { label: 'PO Number', property: 'PONumber', type: 'string' },
        //         { label: 'PO date', property: 'PODate', type: 'string' },
        //         // Level 2
        //         { label: 'PO Line Item', property: 'POLineItem', type: 'string' },
        //         { label: 'Material', property: 'Material', type: 'string' },
        //         { label: 'Material Description', property: 'MaterialDesc', type: 'string' },
        //         { label: 'PO Quantity', property: 'POQuantity', type: 'string' },
        //         { label: 'Unit of Measure', property: 'UOM', type: 'string' },
        //         { label: 'Delivery Date', property: 'DeliveryDate', type: 'string' },
        //         { label: 'Net Price', property: 'NetPrice', type: 'string' },
        //         { label: 'Currency', property: 'Currency', type: 'string' },
        //         { label: 'Per', property: 'Per', type: 'string' },
        //         { label: 'Material Group', property: 'MaterialGroup', type: 'string' },
        //         { label: 'Plant', property: 'Plant', type: 'string' },
        //         { label: 'Storage Location', property: 'StorageLocation', type: 'string' },
        //         // Level 3
        //         { label: 'Confirmation category', property: 'ConfirmationCategory', type: 'string' },
        //         { label: 'Delivery Date Category', property: 'FDDCategory', type: 'string' },
        //         { label: 'Quantity', property: 'Quantity', type: 'string' },
        //         { label: 'Reference', property: 'Reference', type: 'string' },
        //         { label: 'Created on Date', property: 'CreationDate', type: 'string' },
        //         { label: 'Inbound Delivery', property: 'InboundDelivery', type: 'string' },
        //         { label: 'Item', property: 'Item', type: 'string' },
        //         { label: 'Higher Level Item', property: 'HLItem', type: 'string' },
        //         { label: 'Batch', property: 'Batch', type: 'string' },
        //         { label: 'Quantity Reduced', property: 'QtyReduced', type: 'string' },
        //         { label: 'MRP relevant', property: 'MRPRelevant', type: 'string' },
        //         { label: 'MPN Material', property: 'MRPMaterial', type: 'string' },
        //         { label: 'Creation Indicator', property: 'CreationIndicator', type: 'string' },
        //         { label: 'Sequence Number', property: 'SequenceNumber', type: 'string' },
        //         { label: 'Status', property: 'StatusFlag', type: 'string' },
        //         { label: 'Comment', property: 'RejectReason', type: 'string' },
        //         { label: 'Qlik Qty', property: 'QlikQty', type: 'string' },
        //         { label: 'Qlik Date', property: 'QlikDate', type: 'string' },
        //         { label: 'Rejection Date', property: 'ActionDate', type: 'string' },
        //         { label: 'Email Flag', property: 'EmailFlag', type: 'string' },
        //         { label: 'EDI Flag', property: 'EDIFlag', type: 'string' },
        //         // Level 4
        //     ];
        //     // 3. Configure and start the export
        //     var dNewDate=new Date().toLocaleString()
        //     var sFileName=`BTP_Harman_POC_Template_${dNewDate}.xlsx`
        //     var oSettings = {
        //         workbook: { columns: aCols },
        //         dataSource: flatExcelData,
        //         fileName: sFileName
        //     };

        //     if(sGeneratedMsg.includes("No changes to save")){
                
        //     }else{
        //         var oSheet = new Spreadsheet(oSettings);
        //         oSheet.build().finally(function () {
        //             oSheet.destroy();
        //         });
        //     }

        //     // this.aOldData=JSON.parse(JSON.stringify(treeData));
        //     this.onGenSaveMessage(sGeneratedMsg,treeData)
        // },
        onSaveTemplate: async function (oEvent) {
    // 1. Fetch data directly from your master dataset array, ensuring all 19 rows are caught
    // even if the user is currently looking at a filtered set of 3 rows!
    var treeData = JSON.parse(JSON.stringify(this._oOriginalData || this.getView().getModel("excelModel").getProperty("/data")));

    var oCAPModel = this.getOwnerComponent().getModel("capService"); 
    var oActionContext = oCAPModel.bindContext("/sendMailContent(...)");
    oActionContext.setParameter("poHeader", treeData);

    try {
        var oResults = await oActionContext.execute();
        treeData = oActionContext.getBoundContext().getObject().value[0]?.data;
        console.log(oResults);
    } catch (oError) {
        console.log(oError);
    }

    // Convert the full 19-record set into spreadsheet flat rows
    var flatExcelData = this.transformTreeToFlatData(treeData);
    var sGeneratedMsg = this.getChangeSummary(this.aOldData, treeData);

    var aCols = [
        { label: 'Vendor Code', property: 'VendorCode', type: 'string' },
        { label: 'Vendor name', property: 'VendorName', type: 'string' },
        { label: 'PO Number', property: 'PONumber', type: 'string' },
        { label: 'PO date', property: 'PODate', type: 'string' },
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
        { label: 'Confirmation category', property: 'ConfirmationCategory', type: 'string' },
        { label: 'Delivery Date Category', property: 'FDDCategory', type: 'string' },
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
        { label: 'Sequence Number', property: 'SequenceNumber', type: 'string' },
        { label: 'Status', property: 'StatusFlag', type: 'string' },
        { label: 'Comment', property: 'RejectReason', type: 'string' },
        { label: 'Qlik Qty', property: 'QlikQty', type: 'string' },
        { label: 'Qlik Date', property: 'QlikDate', type: 'string' },
        { label: 'Action Date', property: 'ActionDate', type: 'string' },
        { label: 'Email Flag', property: 'EmailFlag', type: 'string' },
        { label: 'EDI Flag', property: 'EDIFlag', type: 'string' }
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
            var that=this
			MessageBox.success(sMsg, {
				actions: [MessageBox.Action.OK],
				emphasizedAction: MessageBox.Action.OK,
				onClose: function (sAction) {
					MessageToast.show(sMsg);


                    const resetNewRecFlag = (data) => {
                        data.forEach(parent => {
                            parent.children?.forEach(lineItem => {
                                lineItem.children?.forEach(record => {
                                    record.newRecFlag = false;
                                });
                            });
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
            var sFixedValue = sNewValue.replace(/[^0-9]/g, "");
            
            if (sNewValue !== sFixedValue) {
                oInput.setValue(sFixedValue);
            }

            // 1. Get the Binding Context for the current line (Third Level)
            const oContext = oInput.getBindingContext("excelModel");
            const sPath = oContext.getPath();

            // 2. Identify the Parent Path (Second Level - PO Line Item)
            // Example path: /0/children/1/children/2 -> Parent: /0/children/1
            const aPathParts = sPath.split("/");
            aPathParts.pop(); // Remove current index
            aPathParts.pop(); // Remove "children" literal
            const sParentPath = aPathParts.join("/");

            const oModel = oContext.getModel("excelModel");
            const oParentData = oModel.getProperty(sParentPath);

            // 3. Get PO Quantity (Total allowed)
            const fPOQuantity = parseFloat(oParentData.POQuantity || 0);

            // 4. Calculate sum of all AB lines under this parent
            const aConfirmations = oParentData.children || [];
            let fTotalConfirmedQty = 0;

            aConfirmations.forEach((item, index) => {
                // Use the live value for the row being edited, otherwise use the model value
                if (oContext.getPath() === sParentPath + "/children/" + index) {
                    fTotalConfirmedQty += parseFloat(sNewValue || 0);
                } else {
                    // Only sum items with Category "AB"
                    if (item.ConfirmationCategory === "AB") {
                        fTotalConfirmedQty += parseFloat(item.Quantity || 0);
                    }
                }
            });

            // 5. Validation Check
            if (fTotalConfirmedQty > fPOQuantity) {
                oInput.setValueState("Error");
                oInput.setValueStateText("The sum of Confirmation quantity exceeds the PO line quantity");
            } else {
                oInput.setValueState("None");
                oInput.setValueStateText("");
                const oTable = oEvent.getSource().getParent().getParent() // Ensure you have the ID of your TreeTable
                const aRows = oTable.getRows();

                aRows.forEach(oRow => {
                    const oRowContext = oRow.getBindingContext("excelModel");
                    if (oRowContext) {
                        const sRowPath = oRowContext.getPath();

                        // Check if this row belongs to the same parent PO Line
                        if (sRowPath.startsWith(sParentPath + "/children/")) {
                            // Find the Input control within the row (usually inside a template/cell)
                            // Adjust the index [n] based on which column your Quantity input is in
                            const oRowInput = oRow.getCells()[1];
                            // const oRowInput = oRow.getCells().find(oCell => oCell.getMetadata().getName() === "sap.m.Input");
                            oRowInput.setValueState("None");
                            oRowInput.setValueStateText("");
                        }
                    }
                });

            }
        },
        onDateLiveChange: function (oEvent) {
            const oDP = oEvent.getSource();
            const oModel = this.getView().getModel("excelModel");
            const oContext = oDP.getBindingContext("excelModel");
            const sNewDateValue = oEvent.getParameter("value");

            if (!sNewDateValue) return;

            // 1. Navigate to Parent Delivery Date
            const sPath = oContext.getPath();
            const sParentPath = sPath.substring(0, sPath.lastIndexOf("/children/"));
            const sParentDateStr = oModel.getProperty(sParentPath + "/DeliveryDate");

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

        transformTreeToFlatData:function(treeData) {
            const flatData = [];
            // Loop through Level 1 (The PO / Vendor groups)
            treeData.forEach(groupNode => {
                // Extract the parent-level data
                const poNumber = groupNode.PONumber;
                const vendorCode = groupNode.VendorCode;
                const vendorName = groupNode.VendorName;
                const poDate = groupNode.PODate;
                // Check if this group has children (Level 2 Line Items)
                if (groupNode.children && groupNode.children.length > 0) {
                    // Loop through Level 2
                    groupNode.children.forEach(itemNode => {
                        if (itemNode.children && itemNode.children.length > 0) {
                            // Loop through Level 3
                            itemNode.children.forEach(subItemNode => {
                                const flatRow = {
                                    PONumber: poNumber,
                                    VendorCode: vendorCode,
                                    VendorName: vendorName,
                                    PODate:poDate,
                                    //Level 2 Start
                                    POLineItem: itemNode.POLineItem,
                                    Material: itemNode.Material,
                                    MaterialDesc: itemNode.MaterialDesc,
                                    POQuantity: itemNode.POQuantity,
                                    UOM: itemNode.UOM,
                                    DeliveryDate: itemNode.DeliveryDate,
                                    NetPrice: itemNode.NetPrice,
                                    Currency: itemNode.Currency,
                                    Per: itemNode.Per,
                                    MaterialGroup:itemNode.MaterialGroup,
                                    Plant : itemNode.Plant,
                                    StorageLocation : itemNode.StorageLocation,
                                    //Level 3 Start
                                    ConfirmationCategory:subItemNode.ConfirmationCategory,
                                    FDDCategory:subItemNode.FDDCategory,
                                    Quantity: subItemNode.Quantity,
                                    Reference: subItemNode.Reference,
                                    CreationDate: subItemNode.CreationDate,
                                    InboundDelivery: subItemNode.InboundDelivery,
                                    Item: subItemNode.Item,
                                    HLItem: subItemNode.HLItem,
                                    Batch: subItemNode.Batch,
                                    QtyReduced: subItemNode.QtyReduced,
                                    MRPRelevant: subItemNode.MRPRelevant,
                                    MRPMaterial: subItemNode.MRPMaterial,
                                    CreationIndicator: subItemNode.CreationIndicator,
                                    SequenceNumber: subItemNode.SequenceNumber,

                                    StatusFlag:subItemNode.StatusFlag,
                                    RejectReason:subItemNode.RejectReason,
                                    ActionDate:subItemNode.ActionDate, 
                                    QlikQty: subItemNode.QlikQty,
                                    QlikDate: subItemNode.QlikDate,
                                    EmailFlag: subItemNode.EmailFlag,
                                    EDIFlag: subItemNode.EDIFlag
                                };
                                flatData.push(flatRow);
                            });
                        }
                    });
                }
            });

            return flatData;
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
            var that = this;
            setTimeout(function () { that._patchL3ScrollDom(); }, 150);
        },
        convertLIFlag:function(bFlag){
            this.lineItemFlag=bFlag
        },
        convertSubLIFlag: function (bFlag) {
            this.sublineItemFlag = bFlag
        },
        onSubShowExpanded:function(oEvent){
            if(this.sublineItemFlag){
                this.convertLIFlag(false)
                let oSource=oEvent.getSource()
                let oBindingContext=oSource.getBindingContext("excelModel")
                let oPath=oBindingContext.getPath()
                let oPanelVisiblePath=oPath+"/NextPanelVisible"

                let bVisiblePath=this.getOwnerComponent().getModel("excelModel").getProperty(oPanelVisiblePath)
                if(bVisiblePath){
                    this.getOwnerComponent().getModel("excelModel").setProperty(oPanelVisiblePath,false)
                }else{
                this.getOwnerComponent().getModel("excelModel").setProperty(oPanelVisiblePath,true)
                }

                var oCurrentItem = oEvent.getSource();

                // 2. Manage the highlight logic
                if (this.prevRecord) {
                    this.prevRecord.removeStyleClass("myCustomHighlight");
                }
                
                oCurrentItem.addStyleClass("myCustomHighlight");
                
                // 3. Store this item as the "previous" for the next time a row is pressed
                this.prevRecord = oCurrentItem;
            }
            this.convertSubLIFlag(true)
            // Patch L3 scroll DOM after SAP renders the new L3 content
            var that = this;
            setTimeout(function () { that._patchL3ScrollDom(); }, 150);
        },
        onAddVendorRowSP: function (oEvent) {
            this.convertLIFlag(false)
            this.convertSubLIFlag(false)
            var oButton = oEvent.getSource();
            var oContext = oButton.getBindingContext("excelModel");
            var oModel = this.getOwnerComponent().getModel("excelModel");
            this.sCurrentPath = oContext.getPath() + "/children"
            var aVendorInputTable=oModel.getProperty(this.sCurrentPath)
            var iSNum;
            var oVendorObject;
            if(aVendorInputTable.length!=0){
                oVendorObject=aVendorInputTable[0]
                var iMaxTabLength=aVendorInputTable.length
                var iMaxSN=aVendorInputTable[iMaxTabLength-1].SequenceNumber
                iSNum=(Number(iMaxSN)+1).toString()
            }else{
                oVendorObject={}
                iSNum=1
            }
            aVendorInputTable.push({
                // LineItemNumber: iLINumber,
                ConfirmationCategory:oVendorObject?.ConfirmationCategory,
                FDDCategory:oVendorObject?.FDDCategory,
                Quantity: "0",
                Reference: oVendorObject?.Reference,
                CreationDate: oVendorObject?.CreationDate,
                InboundDelivery: oVendorObject?.InboundDelivery,
                Item:oVendorObject?.Item,
                HLItem: oVendorObject?.HLItem,
                Batch: oVendorObject?.Batch,
                QtyReduced: oVendorObject?.QtyReduced,
                MRPRelevant: oVendorObject?.MRPRelevant,
                MRPMaterial: oVendorObject?.MRPMaterial,
                CreationIndicator: oVendorObject?.CreationIndicator,
                SequenceNumber: iSNum,
                newRecFlag:true,
                DateMsg:oVendorObject?.DateMsg,
                DateState:oVendorObject?.DateState,
                QlikDate: oVendorObject?.QlikDate,
                QlikQty:oVendorObject?.QlikQty,
                EmailFlag:""
            });
            oModel.setProperty(this.sCurrentPath, aVendorInputTable);
        },
        onDeleteVendorTreeRow: function (oEvent) {
            // 1. Store the context and data you need before opening the MessageBox
            // (In some cases, oEvent.getSource() might be lost if accessed inside the callback)
            var oModel = this.getOwnerComponent().getModel("excelModel");
            var oContext = oEvent.getSource().getBindingContext("excelModel");
            var sPath = oContext.getPath();
            
            // 2. Open the Confirmation Dialog
            sap.m.MessageBox.confirm("Are you sure you want to delete this item?", {
                title: "Confirm Deletion",
                onClose: function (oAction) {
                    // 3. Only proceed if the user clicked 'OK'
                    if (oAction === sap.m.MessageBox.Action.OK) {
                        
                        this.convertLIFlag(false);
                        this.convertSubLIFlag(false);

                        // Find the last slash to separate the index from the parent path
                        var iLastSlashIndex = sPath.lastIndexOf("/");
                        var sParentPath = sPath.substring(0, iLastSlashIndex);
                        var iIndex = sPath.substring(iLastSlashIndex + 1);

                        // Get the actual array from the model
                        var aParentCollection = oModel.getProperty(sParentPath);

                        // Remove the item directly from the model's data
                        if (Array.isArray(aParentCollection)) {
                            aParentCollection.splice(iIndex, 1);
                            oModel.refresh(true);
                            
                            sap.m.MessageToast.show("Item deleted successfully");
                        }
                    }
                }.bind(this) // Crucial: bind 'this' so you can still access this.convertLIFlag
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

            // Helper to flatten the nested children into a simple array of records
            const flatten = (data) => {
                let results = [];
                data.forEach(parent => {
                    parent.children.forEach(lineItem => {
                        lineItem.children.forEach(record => {
                            results.push(record);
                        });
                    });
                });
                return results;
            };


            const flattenReset = (data) => {
                let results = [];
                data.forEach(parent => {
                    // Ensure children exist to avoid errors
                    parent.children?.forEach(lineItem => {
                        lineItem.children?.forEach(record => {
                            // Set the property to false
                            record.newRecFlag = false; 
                            
                            results.push(record);
                        });
                    });
                });
                return results;
            };

            const oldRecords = flattenReset(originalData);
            const newRecords = flatten(currentData);

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
                        r.POLineItem     == newRec.POLineItem     &&
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
            this.convertSubLIFlag(false)
            var oButton = oEvent.getSource(),
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
            var oButton = oEvent.getSource(),
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