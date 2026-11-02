// ===================================================================
// Sri Lanka forest loss starter, 2001-2025
// Data: Hansen/UMD tree cover loss (the data behind Global Forest Watch), 30 m
// How to use: open https://code.earthengine.google.com
//             paste this whole script, press Run.
// ===================================================================

// 1) SETTINGS --------------------------------------------------------
var CANOPY_THRESHOLD = 30;    // % canopy cover in year 2000 that counts as "forest" (GFW default = 30)
var RECENT_FROM = 2021;       // start year for the "recent loss" ranking
var DISTRICT = 'Hambantota';  // close-up district (try 'Vavuniya' or 'Anuradhapura')

// 2) DATA ------------------------------------------------------------
var districts = ee.FeatureCollection('FAO/GAUL/2015/level2')
  .filter(ee.Filter.eq('ADM0_NAME', 'Sri Lanka'));
// If that dataset is missing, use this one instead and replace 'ADM2_NAME' with 'shapeName' below:
// var districts = ee.FeatureCollection('WM/geoLab/geoBoundaries/600/ADM2')
//   .filter(ee.Filter.eq('shapeGroup', 'LKA'));
print('District names (check the spelling of DISTRICT):',
  districts.aggregate_array('ADM2_NAME').sort());

var country = districts.geometry();
var gfc = ee.Image('UMD/hansen/global_forest_change_2025_v1_13');
var forest2000 = gfc.select('treecover2000').gte(CANOPY_THRESHOLD);
var lossYear = gfc.select('lossyear');             // 1 = 2001 ... 25 = 2025
var lossMask = lossYear.gt(0).and(forest2000);
var areaHa = ee.Image.pixelArea().divide(10000);

// band 0 = hectares per pixel, band 1 = year of loss (only where forest was lost)
var lossArea = areaHa.updateMask(lossMask).addBands(lossYear.updateMask(lossMask));
var byYear = ee.Reducer.sum().group({groupField: 1, groupName: 'year'});

// 3) HELPER: grouped results -> bar chart ------------------------------
function yearChart(groups, title) {
  var fc = ee.FeatureCollection(ee.List(groups).map(function (d) {
    d = ee.Dictionary(d);
    return ee.Feature(null, {
      year: ee.Number(d.get('year')).toInt().add(2000).format('%d'),
      hectares: d.get('sum')
    });
  }));
  return ui.Chart.feature.byFeature(fc, 'year', 'hectares')
    .setChartType('ColumnChart')
    .setOptions({
      title: title,
      legend: {position: 'none'},
      hAxis: {title: 'Year'},
      vAxis: {title: 'Hectares lost'}
    });
}

// 4) WHOLE COUNTRY, PER YEAR ------------------------------------------
var national = lossArea.reduceRegion({
  reducer: byYear,
  geometry: country,
  scale: 30,
  maxPixels: 1e13,
  tileScale: 4
});
print(yearChart(national.get('groups'),
  'Sri Lanka: forest loss per year (ha), canopy >= ' + CANOPY_THRESHOLD + '%'));

// 5) ALL DISTRICTS: total loss and recent loss -------------------------
var stats = lossArea.reduceRegions({
  collection: districts,
  reducer: byYear,
  scale: 30,
  tileScale: 4
});

var ranked = stats.map(function (f) {
  var groups = ee.List(f.get('groups'));
  var total = groups.map(function (d) {
    return ee.Dictionary(d).get('sum');
  }).reduce(ee.Reducer.sum());
  var recent = groups.map(function (d) {
    d = ee.Dictionary(d);
    return ee.Algorithms.If(
      ee.Number(d.get('year')).gte(RECENT_FROM - 2000), d.get('sum'), 0);
  }).reduce(ee.Reducer.sum());
  return f.set({total_ha: total, recent_ha: recent});
});

print(ui.Chart.feature.byFeature(ranked.sort('total_ha', false), 'ADM2_NAME', 'total_ha')
  .setChartType('BarChart')
  .setOptions({title: 'Forest loss by district, 2001-2025 (ha)', legend: {position: 'none'}}));

print(ui.Chart.feature.byFeature(ranked.sort('recent_ha', false), 'ADM2_NAME', 'recent_ha')
  .setChartType('BarChart')
  .setOptions({title: 'Forest loss by district, ' + RECENT_FROM + '-2025 (ha)', legend: {position: 'none'}}));

// 6) CLOSE-UP: one district, loss per year -------------------------------
var one = ee.Feature(ranked.filter(ee.Filter.eq('ADM2_NAME', DISTRICT)).first());
print(yearChart(one.get('groups'), DISTRICT + ': forest loss per year (ha)'));

// 7) MAP ----------------------------------------------------------------
Map.centerObject(districts, 7);
Map.addLayer(lossYear.updateMask(lossMask),
  {min: 1, max: 25, palette: ['ffff00', 'ff9900', 'ff0000', '800080']},
  'Forest loss (yellow = 2001 ... purple = 2025)');
Map.addLayer(districts.style({color: 'ffffff', fillColor: '00000000', width: 1}), {}, 'Districts');

// NOTES
// - "Tree cover loss" is not the same as deforestation (fires and harvesting count too).
// - The 2011-2025 data use a newer, more sensitive method, so compare early and late years with care.
// - Lower CANOPY_THRESHOLD (10-20) to include thinner dry-zone woodland.
