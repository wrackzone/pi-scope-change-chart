var scope_change_chart = null;

Ext.define('Rally.technicalservices.scopeChangeChart',{
    extend: 'Rally.ui.chart.Chart',
    alias: 'widget.progresschart',

    itemId: 'rally-chart',
    chartData: {

    },
    loadMask: false,
    // chartColors : ["#E0E0E0","#00a9e0","#009933","#E0E0E0","#00a9e0","#009933"],
    chartColors : ["#CCCCCC","#00a9e0","#009933","#CCCCCC","#00a9e0","#009933"],
    
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
            endOnTick: true,
            min : 0
        },
        yAxis: [
            {
                title: {
                    text: 'Points/Count'
                },
                plotLines : [{
                    color: '#000000',
                    width: 1,
                    value: 0,
                    zIndex : 4,
                    label : {text:"-"}
                }]
            }],

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

    initComponent : function() {
        this.callParent(arguments);
        this.addEvents('series_click');
    },

    constructor: function (config) {

        this.callParent(arguments);

        scope_change_chart = this;

        this.chartData = config.chartData;

        console.log(config);
        
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
        // this.chartConfig.yAxis.plotLines = [];
        // this.chartConfig.yAxis.plotLines.push({
        //     color: '#FF0000',
        //     width: 1,
        //     value: 0,
        //     zIndex : 4,
        //     label : {text:"-"}
        // });

        // this.chartConfig.app = config.app;
    }
});