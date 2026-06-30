(function (global) {
  'use strict';

    function convertStdOsuToMania(text, targetColumns) {
    const stdBeatmap = global.StdOsuParser.parseStdOsuFile(text);
    if (stdBeatmap.mode !== 0) return null;
    if (stdBeatmap.hitObjects.length === 0) return null;

    const converter = new global.StdToManiaConverter.ManiaBeatmapConverter(stdBeatmap, targetColumns);
    const result = converter.convert();

    
    const beatmap = {
      general: Object.assign({}, stdBeatmap.general, { Mode: '3' }),
      metadata: Object.assign({}, stdBeatmap.metadata),
      difficulty: {
        HPDrainRate: Number(stdBeatmap.difficulty.drainRate),
        CircleSize: Number(result.totalColumns),
        OverallDifficulty: Number(stdBeatmap.difficulty.overallDifficulty),
      },
      timingPoints: stdBeatmap.controlPoints.timingPoints.map((tp) => ({
        time: tp.startTime,
        beatLength: tp.beatLength,
        uninherited: true,
      })),
      hitObjects: result.hitObjects.map((h) => ({
        column: h.column,
        time: h.startTime,
        endTime: h.endTime !== null && h.endTime !== undefined ? h.endTime : h.startTime,
        isLongNote: h.endTime !== null && h.endTime !== undefined,
      })).sort((a, b) => a.time - b.time),
      keyCount: result.totalColumns,
      audioFilename: stdBeatmap.audioFilename || '',
      backgroundFilename: stdBeatmap.backgroundFilename || null,
      // marker so downstream code (oszLoader.js) knows this was converted,
      // useful for showing a "Converted from std" badge if desired later
      convertedFromStandard: true,
    };

    return beatmap;
  }

  global.StdToManiaBridge = { convertStdOsuToMania };
})(typeof window !== 'undefined' ? window : global);
