var scope_change_chart = null;

Ext.define('Rally.technicalservices.scopeChangeChart',{
    extend: 'Rally.ui.chart.Chart',
    alias: 'widget.progresschart',

    itemId: 'rally-chart',
    chartData: {},
    loadMask: false,
    chartColors : ["#E0E0E0","#00a9e0","#009933","#E0E0E0","#00a9e0","#009933"],
    chartConfig: {
        // colors : ["#E0E0E0","#00a9e0","#fad200","#8dc63f"],
        chart: {
            type: 'column',
            zoomType: 'xy'
        },
        title: {
            text: 'Program Increment Scope Change Chart'
        },
        subtitle: {
            text: ''
        },
        xAxis: {
            title: {
                enabled : true,
                text: 'Day'
            },
            startOnTick: true,
            endOnTick: true
        },
        yAxis: [
            {
                title: {
                    text: 'Points/Count'
                }
            }
        ],

        tooltip : {
            formatter : function() {
                return 'Day:'+this.point.x+" Value:"+ (this.point.y<0 ? this.point.y*-1:this.point.y);
            }
        },


        plotOptions: {
            series : {
                point : {
                    events : {
                        click : function(a) {
                            console.log(this);
                            scope_change_chart.fireEvent("series_click",this);
                        }
                    }
                }
            },
            column : {
                stacking : 'normal',
            },
        }
    },

    // addFeatureTable : function(features) {
    //     var that = this;

    //     var _onStoreBuilt = function(store) {
    //         that.chartConfig.app.add({
    //             xtype: 'rallytreegrid',
    //             store: store,
    //             context: this.getContext(),
    //             enableEditing: false,
    //             enableBulkEdit: false,
    //             shouldShowRowActionsColumn: false,
    //             enableRanking: false,
    //             columnCfgs: [
    //                 'Name',
    //                 'ScheduleState',
    //                 'Owner'
    //             ]
    //         });
    //     };

    //     var filter = Ext.create('Rally.data.wsapi.Filter', {
    //          property: 'Name',
    //          operator: '=',
    //          value: 'Schedule Usage Reports'
    //     });

    //     Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
    //         models: ['portfolioitem/feature'],
    //         filters : [filter],
    //         autoLoad: true,
    //         enableHierarchy: true
    //     }).then({
    //         success: this._onStoreBuilt,
    //         scope: this
    //     });

    // },
    initComponent : function() {
        this.callParent(arguments);
        this.addEvents('series_click');
    },

    constructor: function (config) {

        this.callParent(arguments);

        scope_change_chart = this;
        
        if (config.title){
            this.chartConfig.title = config.title;
        }
        this.chartConfig.xAxis.plotLines = _.map(config.iterationIndices,function(i){
            return {
                color : '#888888',
                width : 1,
                value : i
            }
        });
        this.chartConfig.xAxis.plotLines.push({
                color : '#FF0000',
                width : 2,
                value : config.baselineIndex

        });
        // this.chartConfig.app = config.app;
    }
});