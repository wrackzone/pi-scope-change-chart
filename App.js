Ext.define('CustomApp', {
    // extend: 'Rally.app.App',
	extend: 'Rally.app.TimeboxScopedApp',
    componentCls: 'app',
    scopeType : 'release',
    items : [
        { xtype:'container',itemId:'settings_box'}
        // { xtype:'container',itemId:'chart_box'},
        // { xtype:'container',itemId:'table_box', layout : 'column', columns : 1, 
        //     items : [ { xtype:'container',itemId:'items_box', width:900},
        //               { xtype:'container',itemId:'changed_box'}]
        // }
    ],

    devMode : false,
    baseline : [],
    baselineIndex : 0,
    todayIndex : -1,
    fetch : ['FormattedID','ObjectID', '_ValidTo', '_ValidFrom', 'PreliminaryEstimate',
    	'AcceptedLeafStoryCount', 'AcceptedLeafStoryPlanEstimateTotal', 
    	'LeafStoryCount', 'LeafStoryPlanEstimateTotal','PercentDoneByStoryCount',
    	'PercentDoneByStoryPlanEstimate'],

    seriesKeys : ['BaselineScope','BaselineScopeInProgress','BaselineScopeCompleted','AddedScope','AddedScopeInProgress','AddedScopeCompleted'],

    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },

    launch: function() {
        if (this.isExternal()){
            this.showSettings(this.config);
        } else {
            this.onSettingsUpdate(this.getSettings());
        }
    },

    _launch : function() {
        // this.onScopeChange();
        if (this.devMode===true) {
            this.onScopeChange({
                getRecord : function() {
                    return {
                        raw : {
                            Name: "2015 Q4",
                            ReleaseDate: "2016-01-16T06:59:59.000Z",
                            ReleaseStartDate: "2015-10-12T06:00:00.000Z"
                        }
                    }
                }
            });
        } else {
            var tbScope = this.getContext().getTimeboxScope();
            if (_.isUndefined(tbScope)) {
                this.add({ html : "This app must be installed in a Release filtered page."});
            } else {
                this.onScopeChange( tbScope );
            }
        }
    },

    onScopeChange : function( scope ) {
        var release = scope.getRecord().raw;
        var that = this;
        that.clear();

        if (_.isUndefined(that.piTypes)) {
            that._loadPortfolioItemTypes(function(types) {
                that.piTypes = types;
                that._loadPreliminaryEstimateValues(function(vals){
                    that.prelimEstimateValues = vals;
                    that.readData(release);
                })
            });
        } else {
            that.readData(release);
        }
    },

    clear : function() {
        var that = this;
        if (!_.isUndefined(that.itemsTable)) {
            that.remove(that.itemsTable);
        }
        if (!_.isUndefined(that.chart)) {
            that.remove(that.chart);
        }
    },

 	readData: function(release) {
 		var that = this;

 		if (that.devMode===true) {
 			that.process( JSON.parse(localStorage.getItem("timeBoxes")), 
 						  JSON.parse(localStorage.getItem("snapshots")));
 			return;
 		}

 		that.loadTimeBoxes(release).then( {
 			success : function(timeboxes) {
                console.log("timeboxes",timeboxes);
				that.getSnapshots(timeboxes[0]).then({
					success : function(snapshots) {
                        console
						localStorage.setItem('timeBoxes', JSON.stringify(timeboxes));
						localStorage.setItem('snapshots', JSON.stringify(snapshots));
						that.process(timeboxes,snapshots);
					}
				})

 			}
 		});
    },

    getBaselineIndex : function(range,iterations) {

        var that = this;
        // [['End of first Day'],['End of first Sprint'],['Day Index'],['Specific Date']]

        if (that.getSetting("baselineType") ==='End of first Day') {
            return 0;
        }
        if (that.getSetting("baselineType") ==='End of first Sprint') {
            var iterationEndDate = moment( moment(_.first(iterations).EndDate).format("M/D/YYYY"));
            var x = _.findIndex(range, iterationEndDate );
            return x;
        }
        return 0;
    },

    process : function(timeboxes,snapshots) {

    	var that = this;
    	_.each(snapshots,function(s){
    		s.range = moment.range(s._ValidFrom,s._ValidTo);
    	})
    	var dr = that.dateRange(_.first(timeboxes[0]));

        // get todays index into the release
        that.todayIndex = _.findIndex(dr, moment(moment().format("M/D/YYYY")));
        console.log("todayIndex",that.todayIndex);
        // get the index of the baseline date
        that.baselineIndex = that.getBaselineIndex(dr,timeboxes[1]);
        that.baseline = [];

    	// iterate each day of the release
		var data = _.map(dr,function( day, index ) {

			// filter to just the snapshots for that day
			var daySnapshots = _.filter(snapshots,function(s){
				return day.within(s.range);
			});
			// group the snapshots by id (there may be more than one in each day)
			var groupedById = _.groupBy(daySnapshots,"FormattedID");
			// get just the last snapshot for each day
			var dayFeatures = _.map( _.keys(groupedById), function(key) {
				return _.last(_.sortBy(groupedById[key],function(s) { return moment(s._ValidFrom);}));
			});
            // check the day to see if it's a baseline date, then set the baseline
            if (index===that.baselineIndex) {
                that.baseline = dayFeatures;
            };
			var groupedDayFeatures = _.groupBy(dayFeatures,function(f) {
				return that.categorize(f);
			})
			return groupedDayFeatures;
		})

        that.iterationIndices = that.dateIndexes( dr, _.map(timeboxes[1],function(i){ return moment(i.EndDate)}));

		that.createChart(that.prepareChartData(data));

    },

    prepareChartData : function( data ) {

        var that = this;
        var reducerFunction = null;

    	// var seriesKeys = _.uniq(_.flatten(_.map(data,function(d){ return _.keys(d) })));

        var countReducer = function(features) {
            return features.length;
        }

        var pointsReducer = function(features) {
            return _.reduce(features,function(memo,feature) { 
                return memo + feature.LeafStoryPlanEstimateTotal }, 0 );
        }

        var estimateReducer = function(features) {
            console.log("features",features);
            return _.reduce(features,function(memo,feature) { 
                var estimate = _.find(that.prelimEstimateValues,function(v) {
                    return feature.PreliminaryEstimate === v.ObjectID;
                });
                return memo + (_.isUndefined(estimate) ? 0 : estimate.Value) }, 0 );
        }

        switch( that.getSetting('aggregateType') ) {

            case 'Points': reducerFunction = pointsReducer; break;
            case 'Count': reducerFunction = countReducer; break;
            case 'Preliminary Estimate': reducerFunction = estimateReducer; break;

        }

    	var series = _.map(that.seriesKeys,function(key){
    		return {
    			name : key,
    			data : _.map(data,function(d,x){ 

                    if (_.isUndefined(d[key]))  {
                        return { 
                            x : x, y : null, features : null
                        };
                    }

                    if( (that.todayIndex >= 0) && (x > that.todayIndex)) {
                        return { 
                            x : x, y : null, features : null
                        };
                    }

                    var value = reducerFunction( d[key] );
                    value = key.startsWith("Baseline") ? value : value * -1;                        

                    return {
                        x : x, y : value, features : d[key]
                    }
    		})
        }
        })
        console.log("series",series);

    	return { series : series };
    },

    createFilterFromFeatures : function(features) {

        var filter = null;
        _.each(features,function(f){
            filter = filter === null ?
                Ext.create('Rally.data.wsapi.Filter', {
                    property: 'ObjectID', operator: '=', value: f.ObjectID
                }) :
                filter.or( {
                    property: 'ObjectID', operator: '=', value: f.ObjectID
                } )
        });
        console.log(filter.toString());
        return filter;
    },

    showItemsTable : function( event ) {
        var that = this;
        console.log("click(a)",event);
        var filter = that.createFilterFromFeatures(event.features);

        Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
            models: ['PortfolioItem/Feature'],
            filters : [filter],
            autoLoad: true,
            enableHierarchy: true
        }).then({
            success: function(store) {
                if (!_.isUndefined(that.itemsTable)) {
                    // that.down("#items_box").remove(that.itemsTable);
                    that.remove(that.itemsTable);
                }
                that.itemsTable = Ext.create('Rally.ui.grid.TreeGrid',{
                    xtype: 'rallytreegrid',
                    store: store,
                    context: that.getContext(),
                    enableEditing: false,
                    enableBulkEdit: false,
                    shouldShowRowActionsColumn: false,
                    enableRanking: false,
                    columnCfgs: [
                        'Name',
                        'State',
                        'Owner',
                        'Project',
                        { dataIndex : 'PreliminaryEstimate', text : 'Size'},
                        { dataIndex : 'PercentDoneByStoryCount', text : '% (C)'},
                        { dataIndex : 'PercentDoneByStoryPlanEstimate', text : '% (P)'},
                        { dataIndex : 'LeafStoryPlanEstimateTotal', text: 'Points'},
                        { dataIndex : 'LeafStoryCount', text : 'Count'}

                    ]
                });
                // that.down("#items_box").add(that.itemsTable);
                that.add(that.itemsTable);
            },
            scope: this
        });
    },

    createChart : function( chartData ) {

        var that = this;

        that.unmask();

        if (!_.isUndefined(that.chart)) {
            that.remove(that.chart);
        }

        that.chart = Ext.create('Rally.technicalservices.scopeChangeChart', {
            itemId: 'rally-chart',
            chartData: chartData,
            iterationIndices : that.iterationIndices,
            baselineIndex : that.baselineIndex,
            app : that,
            listeners : {
                series_click : that.showItemsTable,
                scope : this
            }
        });
        // console.log(that.down("#chart_box"));
        // that.down("#chart_box").add(that.chart);
        that.add(that.chart);

    },

    // returns an array of indexes for a set of dates in a range
    dateIndexes : function(range,dates) {
        var that = this;
        var indices = [];
        var normDates = _.map(dates,function(d){ return moment(d.format("M/D/YYYY"));});

        _.each(range,function(day,i){
            var d = moment(day.format("M/D/YYYY"));
            var x = _.findIndex(normDates,d);
            if (x !== -1) indices.push(i);
        })
        return indices;
    },

    createIterationPlotlines : function(release,iterations) {

    },

    categorize : function( feature ) {
        var that = this;
    	// this function categorizes a feature snapshot into one of the following categories
    	// Scope, ScopeInProgress, ScopeCompleted
        // see if feature is in baseline
        var scopeFunction = function(feature) {
            var bIndex = _.findIndex(that.baseline,function(f){
                return f.ObjectID === feature.ObjectID;
            });

            if (that.baseline.length>0 && bIndex ==-1) {
                return "Added"
            } else {
                return "Baseline"
            }
        }

        var progressFunction = function(feature) {
        	if (feature.PercentDoneByStoryCount === 0)
        		return 'Scope';
        	if ( (feature.PercentDoneByStoryCount >= 0) && (feature.PercentDoneByStoryCount < 1) )
        		return 'ScopeInProgress';
        	if (feature.PercentDoneByStoryCount === 1)
        		return 'ScopeCompleted';
        }

        return scopeFunction(feature) + progressFunction(feature);
    },

    dateRange : function(release) {
    	var dr = [];
    	var range = moment.range( release.ReleaseStartDate, release.ReleaseDate );
    	range.by('days',function(m) {
    		dr.push( moment(m.format("M/D/YYYY")));
    	})
    	return dr;
    },

    getSnapshots : function(releases) {

        var that = this;

        var deferred = new Deft.Deferred();

        Ext.create('Rally.data.lookback.SnapshotStore', {
            autoLoad : true,
            limit: Infinity,
            listeners: {
                refresh: function(store) {
                    var snapshots = [];
                    for (var i = 0, ii = store.getTotalCount(); i < ii; ++i) {
                        snapshots.push(store.getAt(i).data);
                    }
                    deferred.resolve(snapshots);
                }
            },
            fetch: that.fetch,
            find: {
            	//"_TypeHierarchy" : { "$in" : ['PortfolioItem/Feature'] },
                "_TypeHierarchy" : { "$in" : [_.first(that.piTypes)] },
            	"Release" : { "$in" : _.map(releases,function(r){return r.ObjectID})},
            },
            sort: { "_ValidFrom": 1 }
        });
        return deferred.getPromise();
    },

    loadTimeBoxes : function(release) {

        console.log("loadTimeBoxes",release);

    	var me = this;

    	var d1 = Ext.create('Deft.Deferred');
    	me._loadAStoreWithAPromise(
	            "Release", 
	            ["Name","ReleaseStartDate","ReleaseDate"], 
	            [{ property : "Name", operator : "=", value : release.Name }]
	        ).then({
	            scope: me,
	            success: function(values) {
	                d1.resolve(_.map(values,function(v){ return v.data;}));
	            },
	            failure: function(error) {
	                d1.resolve("");
	            }
        });

    	var d2 = Ext.create('Deft.Deferred');
    	me._loadAStoreWithAPromise(
	            "Iteration", 
	            ["Name","StartDate","EndDate"], 
	            [
	            	{ property : "EndDate", operator : "<=", value : release.ReleaseDate },
	             	{ property : "EndDate", operator : ">=", value : release.ReleaseStartDate }
	            ], {
	            	projectScopeDown : false
	            }
	        ).then({
	            scope: me,
	            success: function(values) {
	                d2.resolve(_.map(values,function(v){ return v.data;}));
	            },
	            failure: function(error) {
	                d2.resolve("");
	            }
        });

    	return Deft.Promise.all([d1.promise,d2.promise]);

    },
    
	_loadAStoreWithAPromise: function( model_name, model_fields, filters,ctx,order) {

        var deferred = Ext.create('Deft.Deferred');
        var me = this;
          
        var config = {
            model: model_name,
            fetch: model_fields,
            filters: filters,
            limit: 'Infinity'
        };
        if (!_.isUndefined(ctx)&&!_.isNull(ctx)) {
            config.context = ctx;
        }
        if (!_.isUndefined(order)&&!_.isNull(order)) {
            config.order = order;
        }

        console.log("config",config);

        Ext.create('Rally.data.wsapi.Store', config ).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(records);
                } else {
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },


    // settings code and overrides 
        //showSettings:  Override
    showSettings: function(options) {
        this._appSettings = Ext.create('Rally.app.AppSettings', Ext.apply({
            fields: this.getSettingsFields(),
            settings: this.getSettings(),
            defaultSettings: this.getDefaultSettings(),
            context: this.getContext(),
            settingsScope: this.settingsScope,
            autoScroll: true
        }, options));

        this._appSettings.on('cancel', this._hideSettings, this);
        this._appSettings.on('save', this._onSettingsSaved, this);
        if (this.isExternal()){
            if (this.down('#settings_box').getComponent(this._appSettings.id)===undefined){
                this.down('#settings_box').add(this._appSettings);
            }
        } else {
            this.hide();
            this.up().add(this._appSettings);
        }
        return this._appSettings;
    },
    _onSettingsSaved: function(settings){
        Ext.apply(this.settings, settings);
        this._hideSettings();
        this.onSettingsUpdate(settings);
    },
    //onSettingsUpdate:  Override
    onSettingsUpdate: function (settings){
        Ext.apply(this, settings);
        this._launch(settings);
    },

    getSettingsFields: function() {
        var me = this;

        var aggregateStore = new Ext.data.ArrayStore({
            fields: ['aggregate'],
            data : [['Count'],['Points'],['Preliminary Estimate']]
        });  

        var baselineTypeStore = new Ext.data.ArrayStore({
            fields: ['baselineType'],
            data : [['End of first Day'],['End of first Sprint'],['Day Index'],['Specific Date']]
        });  

        return [ 
            {
                name: 'aggregateType',
                xtype: 'combo',
                store : aggregateStore,
                valueField : 'aggregate',
                displayField : 'aggregate',
                queryMode : 'local',
                forceSelection : true,
                boxLabelAlign: 'after',
                fieldLabel: 'Aggregate Type',
                margin: '0 0 15 50',
                labelStyle : "width:200px;",
                afterLabelTpl: 'Choose <span style="color:#999999;"><i>Count</i> or <i>points</i></span>'
            },
            {
                name: 'baselineType',
                xtype: 'combo',
                store : baselineTypeStore,
                valueField : 'baselineType',
                displayField : 'baselineType',
                queryMode : 'local',
                forceSelection : true,
                boxLabelAlign: 'after',
                fieldLabel: 'Baseline Type',
                margin: '0 0 15 50',
                labelStyle : "width:200px;",
                afterLabelTpl: 'Choose <span style="color:#999999;"><i>Count</i> or <i>points</i></span>'
            }

        ];
    },

 // configs.push({ model : "PreliminaryEstimate", 
 //                       fetch : ['Name','ObjectID','Value'], 
 //                       filters : [] 
 //        });
    _loadPreliminaryEstimateValues : function(callback) {

        var piStore = Ext.create("Rally.data.WsapiDataStore", {
            model: 'PreliminaryEstimate',
            autoLoad: true,
            fetch : true,
            filters: [],
            listeners: {
                load: function(store, records, success) {
                    var piVals = _.map(records,function(r){ return r.data });
                    callback(piVals);
                },
                scope: this
            },
        });
    },

    _loadPortfolioItemTypes : function(callback) {

        var piStore = Ext.create("Rally.data.WsapiDataStore", {
            model: 'TypeDefinition',
            autoLoad: true,
            fetch : true,
            filters: [ { property:"Ordinal", operator:"!=", value:-1} ],
            listeners: {
                load: function(store, records, success) {
                    var piTypes = _.map(records,function(r){ return r.get("TypePath")});
                    callback(piTypes);
                },
                scope: this
            },
        });

    },
});
