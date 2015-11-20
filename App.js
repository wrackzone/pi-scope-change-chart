Ext.define('CustomApp', {
	// extend: 'Rally.app.App',
	extend: 'Rally.app.TimeboxScopedApp',
	componentCls: 'app',
	scopeType : 'release',
	items : [
		{ xtype:'container',itemId:'settings_box'}
	],

	devMode : false,
	baseline : [],
	baselineIndex : 0,
	todayIndex : -1,
	fetch : ['FormattedID','ObjectID', '_ValidTo', '_ValidFrom', 'PreliminaryEstimate',
		'AcceptedLeafStoryCount', 'AcceptedLeafStoryPlanEstimateTotal', 
		'LeafStoryCount', 'LeafStoryPlanEstimateTotal','PercentDoneByStoryCount',
		'PercentDoneByStoryPlanEstimate','Predecessors','Name'],

	seriesKeys : ['BaselineScope','BaselineScopeInProgress','BaselineScopeCompleted','AddedScope','AddedScopeInProgress','AddedScopeCompleted'],

	isExternal: function(){
		return typeof(this.getAppId()) == 'undefined';
	},

	// launch: function() {
	// 	this.callParent(arguments);

	// 	if (this.isExternal()){
	// 		this.showSettings(this.config);
	// 	} else {
	// 		this.onSettingsUpdate(this.getSettings());
	// 	}
	// },

	// _launch : function() {
	// 	console.log("launch");
	// 	if (this.devMode===true) {
	// 		this.onScopeChange({
	// 			getRecord : function() {
	// 				return {
	// 					raw : {
	// 						Name: "Release 4",
	// 						ReleaseDate: "2015-12-31T06:59:59.000Z",
	// 						ReleaseStartDate: "2015-10-01T06:00:00.000Z"
	// 					}
	// 				};
	// 			}
	// 		});
	// 	} else {
	// 		// get the release timebox scope.
	// 		var tbScope = this.getContext().getTimeboxScope();
	// 		if (_.isUndefined(tbScope)) {
	// 			this.add({ html : "This app must be installed in a Release filtered page."});
	// 		} else {
	// 			this.onScopeChange( tbScope );
	// 		}
	// 	}
	// },

	onScopeChange : function( scope ) {
		// grab just the release data
		console.log("onScopeChange");
		var release = scope.getRecord().raw;
		var that = this;
		that.clear();

		// if first time loaded, get the pi types (we want to filter to just Feature level items)
		// and preliminary estimate values (only want to do this once)
		if (_.isUndefined(that.piTypes)) {
			that._loadPortfolioItemTypes(function(types) {
				that.piTypes = types;
				that._loadPreliminaryEstimateValues(function(vals){
					that.prelimEstimateValues = vals;
					that.readData(release);
				});
			});
		} else {
			that.readData(release);
		}
	},

	// remove the extjs components from the page
	clear : function() {
		var that = this;
		if (!_.isUndefined(that.itemsTable)) {
			that.remove(that.itemsTable);
		}
		if (!_.isUndefined(that.chart)) {
			that.remove(that.chart);
		}
	},

	// read releases (child projects) and iterations for the selected release.
	readData: function(release) {
		var that = this;
		console.log("readData");

		// if (that.devMode===true) {
		// 	that.process( JSON.parse(localStorage.getItem("timeBoxes")), 
		// 				JSON.parse(localStorage.getItem("snapshots")));
		// 	return;
		// }

		that.showMask("Loading timeboxes...");
		that.loadTimeBoxes(release).then( {
			success : function(timeboxes) {
				that.showMask("Loading snapshots...");
				that.getSnapshots(timeboxes[0]).then({
					success : function(snapshots) {
						console.log("readData snapshots",snapshots);
						// localStorage.setItem('timeBoxes', JSON.stringify(timeboxes));
						// localStorage.setItem('snapshots', JSON.stringify(snapshots));
						that.process(timeboxes,snapshots);
					},
					failure : function(a,b,c) {
						that.unmask();
						console.log("a,b,c",a,b,c);
					}

				});
			}
		});
	},

	// The release is an array of dates; find the index of the date for the baseline. 
	// The baseline date is based on the selected configuration
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

	// process the snapshots, grouping them into values for each day
	process : function(timeboxes,snapshots) {
		console.log("process");

		var that = this;
		that.showMask("Processing snapshots...");

		// add a range object for each snapshot, we use it later to see if the day is in that range
		_.each(snapshots,function(s){
			s.range = moment.range(s._ValidFrom,s._ValidTo);
		});
		// construct the date range array (array of dates for the release)
		var dr = that.dateRange(_.first(timeboxes[0]));

		// get todays index into the release
		that.todayIndex = _.findIndex(dr, moment(moment().format("M/D/YYYY")));
		
		// get the index of the baseline date
		that.baselineIndex = that.getBaselineIndex(dr,timeboxes[1]);
		// initiatlize the baseline (the set of features that exist on the baseline)
		that.baseline = [];

		// iterate each day of the release
		var data = _.map(dr,function( day, index ) {
			// filter to just the snapshots for that day
			var daySnapshots = _.filter(snapshots,function(s){
				return day.within(s.range);
			});

			// group the snapshots by id (there may be more than one in each day)
			var groupedById = _.groupBy(daySnapshots,"ObjectID");
			// get just the last snapshot for each day
			var dayFeatures = _.map( _.keys(groupedById), function(key) {
				return _.last(_.sortBy(groupedById[key],function(s) { return moment(s._ValidFrom);}));
			});
			// check the day to see if it's a baseline date, then set the baseline
			if (index===that.baselineIndex) {
				that.baseline = dayFeatures;
			}
			var groupedDayFeatures = _.groupBy(dayFeatures,function(f) {
				return that.categorize(f,index);
			});
			return groupedDayFeatures;
		});

		// data is an array of objects; each object is keyed by the category and the key value is the 
		// set of applicable features

		// get the set of indexes into release array that represent end dates of iterations
		that.iterationIndices = that.dateIndexes( dr, _.map(timeboxes[1],function(i){ return moment(i.EndDate);}));

		that.createChart(that.prepareChartData(data));

	},

	// returns an array of features that have been added or removed since the baseline
	getScopeChangeFeatures : function(chart,x) {

		var that = this;

		// aggregate the features for all series for the selected data
		var currentFeatures = _.compact(_.flatten(_.map(chart.series,function(s) { return s.data[x].features })));
		var previousFeatures = that.baseline;

		// get feature ids for comparison
		var cFeatures = _.map( currentFeatures, function(f) { return f.FormattedID; });
		var pFeatures = _.map( previousFeatures, function(f) { return f.FormattedID; });

		var removed = _.difference(pFeatures, cFeatures);
		var added = _.difference(cFeatures, pFeatures);

		var findit = function( features, fid ) {
			return _.find( features, function(f){ return f.FormattedID === fid; });
		}

		var r = _.map ( removed, function(fid) { 
			var f = findit(previousFeatures,fid);
			f["Scope"] = "Removed";
			return f;
		});

		var a = _.map ( added, function(fid) { 
			var f = findit(currentFeatures,fid);
			f["Scope"] = "Added";
			return f;
		})

		return a.concat(r);

	},

	addScopeChangeTable : function( features ) {

		var that = this;

		// create the data store
	    var store = new Ext.data.ArrayStore({
	        fields: [
	        	{name: 'Scope'},
	           	{name: 'FormattedID' },
	           	{name: 'Name' }
	        ]
	    });
    	store.loadData(features);

		var grid = new Ext.grid.GridPanel({
	        store: store,
	        columns: [
	            { header: "Scope", sortable: true, dataIndex: 'Scope'},
	            { header: "ID", sortable: true, dataIndex: 'FormattedID'},
	            { header: "Name", sortable: true, dataIndex: 'Name',width:250},
	            { header: "Size", sortable: true, dataIndex: 'PreliminaryEstimate'}
	        ],
	        stripeRows: true,
	        title:'Scope Change Since Baseline',
	    });

	    // that.add(grid);
	    return grid;

	},

	// returns a function to aggregate the features based on the app configuration
	getReducerFunction : function() {

		var that = this;
		var reducerFn = null;

		// simple count of features
		var countReducer = function(features) {
			return features.length;
		};

		// sum of story points for the features
		var pointsReducer = function(features) {
			return _.reduce(features,function(memo,feature) { 
				return memo + feature.LeafStoryPlanEstimateTotal; }, 0 );
		};

		// sum of preliminary estimate values for the features
		var estimateReducer = function(features) {
			return _.reduce(features,function(memo,feature) { 
				var estimate = _.find(that.prelimEstimateValues,function(v) {
					return feature.PreliminaryEstimate === v.ObjectID;
				});
				return memo + (_.isUndefined(estimate) ? 0 : estimate.Value); 
			}, 0 );
		};

		switch( that.getSetting('aggregateType') ) {
			case 'Points': reducerFn = pointsReducer; break;
			case 'Count': reducerFn = countReducer; break;
			case 'Preliminary Estimate': reducerFn = estimateReducer; break;
		}

		return reducerFn;

	},

	// prepare the chart data by transforming the data array into a set of highcharts series objects
	prepareChartData : function( data ) {

		var that = this;
		that.showMask("Preparing chart...");

		var reducerFunction = that.getReducerFunction();

		var series = _.map(that.seriesKeys,function(key){
			return {
				name : key,
				data : _.map( data, function(d,x){ 

					// if no features for category return a null value
					if (_.isUndefined(d[key]))  {
						return { 
							x : x, y : null, features : null
						};
					}

					// return null value for future dates
					if( (that.todayIndex >= 0) && (x > that.todayIndex+1)) {
						return { 
							x : x, y : null, features : null
						};
					}

					// calculate the value by aggregating the features
					var value = reducerFunction( d[key] );
					// if it's not baseline multiply by -1 so it is shown below the x-axis
					value = key.startsWith("Baseline") ? value : value * -1;                        

					return {
						x : x, y : value, features : d[key]
					};
			})
		};
		});
		return { series : series };
	},

	// create a filter for showing a set of features based on their object id's
	createFilterFromFeatures : function(features) {

		var filter = null;
		_.each(features,function(f){
			filter = filter === null ?
				Ext.create('Rally.data.wsapi.Filter', {
					property: 'ObjectID', operator: '=', value: f.ObjectID
				}) :
				filter.or( {
					property: 'ObjectID', operator: '=', value: f.ObjectID
				});
		});
		return filter;
	},

	// called when a data value is clicked. Shows a grid of the features that make up that data point.
	showItemsTable : function( event ) {
		var that = this;

		var scopeChangeFeatures = that.getScopeChangeFeatures(event.series.chart,event.x);

		if (!_.isUndefined(that.scopeGrid)) {
			that.remove(that.scopeGrid);
		}
		that.scopeGrid = that.addScopeChangeTable(scopeChangeFeatures);

		var filter = that.createFilterFromFeatures(event.features);

		Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
			models: ['PortfolioItem/Feature'],
			filters : [filter],
			autoLoad: true,
			enableHierarchy: true,
			listeners : {
				load : function(a,b,c) {
				}
			},
		}).then({
			success: function(store) {
				// remove table if it already exists
				if (!_.isUndefined(that.itemsTable)) {
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
						'Name', 'Predecessors', 'State', 'Release', 'Project',
						{ dataIndex : 'PreliminaryEstimate.Name', text : 'Size'},
						{ dataIndex : 'PercentDoneByStoryCount', text : '% (C)'},
						{ dataIndex : 'PercentDoneByStoryPlanEstimate', text : '% (P)'},
						{ dataIndex : 'LeafStoryPlanEstimateTotal', text: 'Points'},
						{ dataIndex : 'LeafStoryCount', text : 'Count'}
					]
				});

				that.add(that.itemsTable);
				that.add(that.scopeGrid);

			}
		});
	},

	createChart : function( chartData ) {

		var that = this;
		that.hideMask();

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
				// called when user clicks on a series in the chart
				series_click : that.showItemsTable,
				scope : this
			}
		});
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
		});
		return indices;
	},

	categorize : function( feature, dayIndex ) {
		var that = this;
		// this function categorizes a feature snapshot into one of the following categories
		// Scope, ScopeInProgress, ScopeCompleted
		// see if feature is in baseline
		var scopeFunction = function(feature) {
			var bIndex = _.findIndex(that.baseline,function(f){
				return f.ObjectID === feature.ObjectID;
			});

			if (that.baseline.length>0 && bIndex ==-1 && dayIndex >= that.baselineIndex) {
				return "Added";
			} else {
				return "Baseline";
			}
		};

		var progressFunction = function(feature) {
			if (feature.PercentDoneByStoryCount === 0)
				return 'Scope';
			if ( (feature.PercentDoneByStoryCount >= 0) && (feature.PercentDoneByStoryCount < 1) )
				return 'ScopeInProgress';
			if (feature.PercentDoneByStoryCount === 1)
				return 'ScopeCompleted';
		};

		return scopeFunction(feature) + progressFunction(feature);
	},

	dateRange : function(release) {
		var dr = [];
		var range = moment.range( release.ReleaseStartDate, release.ReleaseDate );
		range.by('days',function(m) {
			dr.push( moment(m.format("M/D/YYYY")));
		});
		return dr;
	},

	getSnapshots : function(releases) {
		console.log("getSnapshots");

		var that = this;

		var deferred = new Deft.Deferred();

		Ext.create('Rally.data.lookback.SnapshotStore', {
			autoLoad : true,
			limit: Infinity,
			listeners: {
				refresh: function(store) {
					console.log("snapshots refresh:",store);
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
				"Release" : { "$in" : _.map(releases,function(r){return r.ObjectID;})}
			},
			sort: { "_ValidFrom": 1 }
		});
		return deferred.getPromise();
	},

	loadTimeBoxes : function(release) {

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
					var iterations = _.map(values,function(v){ return v.data;});
					var rawi = _.map(values,function(v){ return v.raw;});
					iterations = _.sortBy(iterations,function(i){ return moment(i.EndDate)});
					d2.resolve(iterations);
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

	_loadPreliminaryEstimateValues : function(callback) {

		var piStore = Ext.create("Rally.data.WsapiDataStore", {
			model: 'PreliminaryEstimate',
			autoLoad: true,
			fetch : true,
			filters: [],
			listeners: {
				load: function(store, records, success) {
					var piVals = _.map(records,function(r){ return r.data; });
					callback(piVals);
				},
				scope: this
			}
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
					var piTypes = _.map(records,function(r){ return r.get("TypePath");});
					callback(piTypes);
				},
				scope: this
			}
		});
	},

	showMask: function(msg) {
        if ( this.getEl() ) { 
            this.getEl().unmask();
            this.getEl().mask(msg);
        }
    },

    hideMask: function() {
        this.getEl().unmask();
    }
});
