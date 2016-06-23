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
            useHTML: true,
            formatter : function() {
                var that = this;
                // console.log(this);
                var pointVal = function(series) {
                    var val = series.data[that.point.x].y;
                    return !_.isNull(val) ? (val <0 ? val*-1 : val) : 0;
                };
                var sumSeries = function(seriesContains) {
                    return _.reduce( that.series.chart.series, function(sum,series) {
                        return sum + (series.name.includes(seriesContains) ? pointVal(series) : 0);
                    },0);
                };
                var getSeries = function(seriesName) {
                    return _.reduce( that.series.chart.series, function(sum,series) {
                        return sum + (series.name===seriesName ? pointVal(series) : 0);
                    },0);
                };

                var pct = function(val,total) {
                    return total > 0 ? Math.round((val/total)*100) : 0;
                }

                var labelPct = function(val,total) {
                    return "" + val + " ("+pct(val,total)+"%)";
                }

                var total = _.reduce( this.series.chart.series, function(sum,series) {
                    return sum + pointVal(series);
                },0);

                var inprogress = sumSeries("InProgress");
                var completed = sumSeries("Completed");
                var notstarted = total - (completed+inprogress);
                var bs = getSeries("BaselineScope");
                var bsip = getSeries("BaselineScopeInProgress");
                var bsc = getSeries("BaselineScopeCompleted");
                var as = getSeries("AddedScope");
                var asip = getSeries("AddedScopeInProgress");
                var asc = getSeries("AddedScopeCompleted");

                var ts = bs + as;
                var tip = bsip + asip;
                var tc = bsc + asc;

                var tb = bs+bsip+bsc;
                var ta = as+asip+asc;
                var tt = tb+ta;

                 var tpl = Ext.create('Ext.Template', 
                    // border='1'
                    "<table >"+
                    "<tr>"+
                        "<td></td>"+
                        "<td>Baseline</td>"+
                        "<td>Added</td>"+
                        "<td>Total</td>"+
                    "</tr>"+

                    "<tr>"+
                        "<td>NotStarted</td>"+
                        "<td>{bs}</td>"+
                        "<td>{as}</td>"+
                        "<td>{ts}</td>"+
                    "</tr>"+

                    "<tr>"+
                        "<td>In-Progress</td>"+
                        "<td>{bsip}</td>"+
                        "<td>{asip}</td>"+
                        "<td>{tip}</td>"+
                    "</tr>"+

                    "<tr>"+
                        "<td>Completed</td>"+
                        "<td>{bsc}</td>"+
                        "<td>{asc}</td>"+
                        "<td>{tc}</td>"+
                    "</tr>"+

                    "<tr>"+
                        "<td>Total</td>"+
                        "<td>{tb}</td>"+
                        "<td>{ta}</td>"+
                        "<td>{tt}</td>"+
                    "</tr>"+
                    "</table>",
                    { compiled : true });

                 return tpl.apply({bs:labelPct(bs,total),bsip:labelPct(bsip,total),bsc:labelPct(bsc,total),
                    as:labelPct(as,total),asip:labelPct(asip,total),asc:labelPct(asc,total),
                    ts:labelPct(ts,total),tip:labelPct(tip,total),tc:labelPct(tc,total),
                    tb:labelPct(tb,total),ta:labelPct(ta,total),tt:labelPct(tt,total) });

                // var table = "<table><tr><th>Series</th><th>Total</th><th>%</th>"+
                //     "<tr><td>NotStarted</td><td>"+notstarted+"</td><td>+" + pct(notstarted,total)+"</td></tr" +
                //     "<tr><td>NotStarted</td><td>"+inprogress+"</td><td>+" + pct(inprogress,total)+"</td></tr" +
                //     "<tr><td>NotStarted</td><td>"+completed+"</td><td>+" + pct(completed,total)+"</td></tr" +
                //     "</table>"
                // var table = "<table border='1'><tr><td>row1</td><td>col1</td></tr></table>";
                
                // return table + that.series.name + ' Day:'+this.point.x+" Value:"+ (this.point.y<0 ? this.point.y*-1:this.point.y) + " Total:"+total +"<br>"+
                //     "<br>NotStarted:" + notstarted + " (" + pct(notstarted,total) + "%)" +
                //     "<br>In-Progress:" + inprogress + " (" + pct(inprogress,total) + "%)" +
                //     "<br>Completed:" + completed + " (" + pct(completed,total) + "%)"
                    

            }
        },


        plotOptions: {
            series : {
                point : {
                    events : {
                        click : function(a) {
                            // console.log(this);
                            scope_change_chart.fireEvent("series_click",this);
                        }
                    }
                },
                pointPadding: 0.1,
                groupPadding: 0,
                borderWidth: 0
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

        // console.log(config);
        
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