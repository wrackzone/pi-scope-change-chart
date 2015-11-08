Ext.define('CustomApp', {
    // extend: 'Rally.app.App',
	extend: 'Rally.app.TimeboxScopedApp',
    componentCls: 'app',
    scopeType : 'release',

    devMode : true,

    fetch : ['FormattedID','ObjectID', '_ValidTo', '_ValidFrom', 
    	'AcceptedLeafStoryCount', 'AcceptedLeafStoryPlanEstimateTotal', 
    	'LeafStoryCount', 'LeafStoryPlanEstimateTotal','PercentDoneByStoryCount',
    	'PercentDoneByStoryPlanEstimate'],

 	onScopeChange: function(scope) {
 		var that = this;
 		console.log(scope.getRecord());

 		if (that.devMode===true) {
 			that.process( JSON.parse(localStorage.getItem("timeBoxes")), 
 						  JSON.parse(localStorage.getItem("snapshots")));
 			return;
 		}

 		that.loadTimeBoxes(scope).then( {
 			success : function(timeboxes) {
 				console.log("timeboxes",timeboxes);
				that.getSnapshots(timeboxes[0]).then({
					success : function(snapshots) {
						console.log("snapshots",snapshots);
						console.log("snapshots",snapshots.length);
						// save data
						localStorage.setItem('timeBoxes', JSON.stringify(timeboxes));
						localStorage.setItem('snapshots', JSON.stringify(snapshots));
						that.process(timeboxes,snapshots);
						// that.dateRange(_.first(timeboxes[0]));
					}
				})

 			}
 		});
    },

    process : function(timeboxes,snapshots) {
    	console.log(timeboxes,snapshots);
    	var that = this;
    	_.each(snapshots,function(s){
    		s.range = moment.range(s._ValidFrom,s._ValidTo);
    	})
    	var dr = that.dateRange(_.first(timeboxes[0]));

    	// iterate each day of the release
		_.each(dr,function(day){
			// filter to just the snapshots for that day
			var daySnapshots = _.filter(snapshots,function(s){
				return day.within(s.range);
			});
			console.log(day.format("D/M/YYYY"),daySnapshots.length);
			// group the snapshots by id (there may be more than one in each day)
			var groupedById = _.groupBy(daySnapshots,"FormattedID");
			console.log(_.keys(groupedById),_.keys(groupedById).length);
			// get just the last snapshot for each day
			var dayFeatures = _.map( _.keys(groupedById), function(key) {
				return _.last(_.sortBy(groupedById[key],function(s) { return moment(s._ValidFrom);}));
			})
			var groupedDayFeatures = _.groupBy(dayFeatures,function(f) {
				return that.categorize(f);
			})
			console.log(groupedDayFeatures);
		})

    },

    categorize : function( feature ) {
    	// this function categorizes a feature snapshot into one of the following categories
    	// Scope, ScopeInProgress, ScopeCompleted
    	if (feature.PercentDoneByStoryCount === 0)
    		return 'Scope';
    	if ( (feature.PercentDoneByStoryCount >= 0) && (feature.PercentDoneByStoryCount < 1) )
    		return 'ScopeInProgress';
    	if (feature.PercentDoneByStoryCount === 1)
    		return 'ScopeCompleted';
    },

    dateRange : function(release) {

    	var dr = [];

		console.log(release.ReleaseStartDate, release.ReleaseDate);
    	var range = moment.range( release.ReleaseStartDate, release.ReleaseDate );

    	range.by('days',function(moment) {
    		// console.log( moment.format("M/D/YYYY"));
    		dr.push( moment );
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
            	"_TypeHierarchy" : { "$in" : ['PortfolioItem/Feature'] },
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
    }


});
