Ext.define('CustomApp', {
    // extend: 'Rally.app.App',
	extend: 'Rally.app.TimeboxScopedApp',
    componentCls: 'app',
    scopeType : 'release',
    items : [
        {xtype:'container',itemId:'settings_box'}
    ],

    devMode : false,
    baseline : [],
    baselineIndex : 0,
    todayIndex : -1,
    fetch : ['FormattedID','ObjectID', '_ValidTo', '_ValidFrom', 
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
        this.onScopeChange();

    },

    onScopeChange : function( scope ) {
        var that = this;

        if (_.isUndefined(that.piTypes)) {
            that._loadPortfolioItemTypes(function(types) {
                that.piTypes = types;
                that.readData(scope);
            });
        } else {
            that.readData(scope);
        }
    },

 	readData: function(scope) {
 		var that = this;

 		if (that.devMode===true) {
 			that.process( JSON.parse(localStorage.getItem("timeBoxes")), 
 						  JSON.parse(localStorage.getItem("snapshots")));
 			return;
 		}

 		that.loadTimeBoxes(scope).then( {
 			success : function(timeboxes) {
				that.getSnapshots(timeboxes[0]).then({
					success : function(snapshots) {
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

    	// var seriesKeys = _.uniq(_.flatten(_.map(data,function(d){ return _.keys(d) })));

        var countReducer = function(features) {
            return features.length;
        }

        var pointsReducer = function(features) {
            return _.reduce(features,function(memo,feature) { 
                return memo + feature.LeafStoryPlanEstimateTotal }, 0 );
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

                    var value = that.getSetting('aggregateType')==='Points' 
                        ? pointsReducer(d[key]) 
                        : countReducer(d[key]);
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
            baselineIndex : that.baselineIndex
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

    loadTimeBoxes : function(scope) {

    	var me = this;

    	var d1 = Ext.create('Deft.Deferred');
    	me._loadAStoreWithAPromise(
	            "Release", 
	            ["Name","ReleaseStartDate","ReleaseDate"], 
	            [{ property : "Name", operator : "=", value : scope.getRecord().get("Name") }]
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
	            	{ property : "EndDate", operator : "<=", value : scope.getRecord().get("ReleaseDate") },
	             	{ property : "EndDate", operator : ">=", value : scope.getRecord().get("ReleaseStartDate") }
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
            data : [['Count'],['Points']]
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
