import EventBus from '../lib/EventBus';
import TimeKeeper from '../engine/TimeKeeper';
import { EVENT } from '../constants/eventNames';


// Unix 时间戳
// systemTimeMs: new Date().getTime()

const DEFAULT_EXPORT_FORMAT = 'txt';

const EVENT_TYPE = {
	GAME_START: 'GAME_START',
	GAME_PAUSE: 'GAME_PAUSE',
	GAME_RESUME: 'GAME_RESUME',
	SCORE_CHANGE: 'SCORE_CHANGE'
};

class GameLogRecorder {
	constructor() {
		this._eventBus = EventBus;
		this._records = [];
		this._hasStarted = false;

		this._onAirportChangeHandler = this._onAirportChange.bind(this);
		this._eventBus.on(EVENT.AIRPORT_CHANGE, this._onAirportChangeHandler);
	}

	get records() {
		return [...this._records];
	}

	hasRecords() {
		return this._records.length > 0;
	}

	recordGameStart(currentScore = null) {
		if (this._hasStarted) {
			return;
		}

		this._hasStarted = true;

		this._records.push({
			...this._buildBaseRecord(EVENT_TYPE.GAME_START),
			currentScore
		});
	}

	recordGamePause(currentScore = null) {
		if (!this._hasStarted) {
			return;
		}

		this._records.push({
			...this._buildBaseRecord(EVENT_TYPE.GAME_PAUSE),
			currentScore
		});
	}

	recordGameResume(currentScore = null) {
		if (!this._hasStarted) {
			return;
		}

		this._records.push({
			...this._buildBaseRecord(EVENT_TYPE.GAME_RESUME),
			currentScore
		});
	}

	recordScoreChange(scoreEvent, scoreDelta, currentScore) {
		if (!this._hasStarted) {
			return;
		}

		this._records.push({
			...this._buildBaseRecord(EVENT_TYPE.SCORE_CHANGE),
			scoreEvent,
			scoreDelta,
			currentScore
		});
	}

	reset() {
		this._records = [];
		this._hasStarted = false;
	}

	exportLogs(format = DEFAULT_EXPORT_FORMAT) {
		if (!this.hasRecords()) {
			return {
				ok: false,
				reason: 'empty',
				message: '暂无游戏日志可导出。'
			};
		}

		const normalizedFormat = this._normalizeFormat(format);
		const exportPayload = this._buildExportPayload(normalizedFormat);
		const timestampMs = new Date().getTime();
		const fileName = `openscope-game-log-${timestampMs}.${exportPayload.extension}`;
		let url = null;

		try {
			const blob = new Blob([exportPayload.content], { type: exportPayload.mimeType });
			url = URL.createObjectURL(blob);

			const link = document.createElement('a');
			link.href = url;
			link.download = fileName;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);

			return {
				ok: true,
				fileName,
				message: `游戏日志导出成功：${fileName}`
			};
		} catch (error) {
			return {
				ok: false,
				reason: 'download-failed',
				message: '日志导出失败，请检查浏览器下载权限。',
				error
			};
		} finally {
			if (url) {
				URL.revokeObjectURL(url);
			}
		}
	}

	_buildBaseRecord(eventType) {
		return {
			eventType,
			systemTimeMs: new Date().getTime(),
			gameTime: TimeKeeper.accumulatedDeltaTime
		};
	}

	_normalizeFormat(format) {
		if (typeof format !== 'string') {
			return DEFAULT_EXPORT_FORMAT;
		}

		const normalized = format.trim().toLowerCase();

		if (normalized === 'csv') {
			return 'csv';
		}

		return DEFAULT_EXPORT_FORMAT;
	}

	_buildExportPayload(format) {
		if (format === 'csv') {
			return {
				content: this._buildCsvContent(),
				extension: 'csv',
				mimeType: 'text/csv;charset=utf-8'
			};
		}

		return {
			content: this._buildTxtContent(),
			extension: 'txt',
			mimeType: 'text/plain;charset=utf-8'
		};
	}

	_buildTxtContent() {
		const lines = [
			'openScope Game Log',
			`Exported At (ms): ${new Date().getTime()}`,
			`Total Records: ${this._records.length}`,
			''
		];

		for (let i = 0; i < this._records.length; i++) {
			const record = this._records[i];
			const prefix = `${i + 1}. [${record.eventType}]`;

			lines.push(
				`${prefix} systemTimeMs=${record.systemTimeMs}; gameTime=${record.gameTime}; ` +
				`scoreEvent=${record.scoreEvent || ''}; scoreDelta=${record.scoreDelta ?? ''}; ` +
				`currentScore=${record.currentScore ?? ''}`
			);
		}

		return lines.join('\n');
	}

	_buildCsvContent() {
		const headers = [
			'eventType',
			'systemTimeMs',
			'gameTime',
			'scoreEvent',
			'scoreDelta',
			'currentScore'
		];

		const rows = [headers.join(',')];

		for (let i = 0; i < this._records.length; i++) {
			const record = this._records[i];
			const row = [
				record.eventType,
				record.systemTimeMs,
				record.gameTime,
				record.scoreEvent || '',
				record.scoreDelta ?? '',
				record.currentScore ?? ''
			].map((value) => this._escapeCsvValue(value));

			rows.push(row.join(','));
		}

		return rows.join('\n');
	}

	_escapeCsvValue(value) {
		const stringValue = String(value);

		if (/[,\"\n]/.test(stringValue)) {
			return `"${stringValue.replace(/\"/g, '""')}"`;
		}

		return stringValue;
	}

	_onAirportChange() {
		this.reset();
		this.recordGameStart();
	}
}

export default new GameLogRecorder();
