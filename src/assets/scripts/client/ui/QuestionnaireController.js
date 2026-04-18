import $ from 'jquery';
import _isNaN from 'lodash/isNaN';
import EventBus from '../lib/EventBus';
import EventTracker from '../EventTracker';
import GameController from '../game/GameController';
import GameLogRecorder from '../gamelog/GameLogRecorder';
import TimeKeeper from '../engine/TimeKeeper';
import { EVENT } from '../constants/eventNames';
import { SELECTORS } from '../constants/selectors';
import { TRACKABLE_EVENT } from '../constants/trackableEvents';
import { QUESTIONNAIRE } from '../constants/QuestionnaireConstants';

/**
 * @property UI_QUESTIONNAIRE_MODAL_TEMPLATE
 * @type {string}
 * @final
 */
const UI_QUESTIONNAIRE_MODAL_TEMPLATE = `
    <div class="questionnaire-dialog dialog notSelectable">
        <p class="dialog-title">Fatigue check</p>
        <div class="dialog-body nice-scrollbar">
            <p class="questionnaire-question"></p>
            <div class="questionnaire-options"></div>
        </div>
        <div class="dialog-footer questionnaire-footer">
            <button class="button js-questionnaireSubmitButton">Submit</button>
            <button class="button js-questionnaireCloseButton">Close</button>
        </div>
    </div>`;

const UI_COGTEST_MODAL_TEMPLATE = `
    <div class="questionnaire-dialog dialog notSelectable cogtest-dialog">
        <p class="dialog-title">认知状态评估（CogTest）</p>
        <div class="dialog-body nice-scrollbar cogtest-body">
            <div class="cogtest-stage" data-stage="intro">
                <p>本模块包含 3 个短测验：PVT、2-Back、Stroop。</p>
                <p>请在安静环境下完成，过程中尽量快速且准确作答。</p>
                <button class="button js-cogtestStartButton">开始评估</button>
            </div>
            <div class="cogtest-stage cogtest-stageHidden" data-stage="pvt">
                <p class="cogtest-stage-title">PVT（精神运动警觉性）</p>
                <p class="js-pvtStatus">等待开始...</p>
                <p class="js-pvtCounter"></p>
                <button class="button cogtest-pvt-box js-pvtResponseButton">等待信号...</button>
            </div>
            <div class="cogtest-stage cogtest-stageHidden" data-stage="2back">
                <p class="cogtest-stage-title">2-Back（工作记忆）</p>
                <p class="js-nbackCounter"></p>
                <p class="js-nbackPrompt">等待开始...</p>
                <p class="js-nbackStimulus"></p>
                <div class="questionnaire-footer">
                    <button class="button js-nbackYesButton">Y（相同）</button>
                    <button class="button js-nbackNoButton">N（不同）</button>
                </div>
            </div>
            <div class="cogtest-stage cogtest-stageHidden" data-stage="stroop">
                <p class="cogtest-stage-title">Stroop（抗干扰）</p>
                <p class="js-stroopCounter"></p>
                <p class="js-stroopPrompt">忽略文字，仅判断箭头方向</p>
                <p class="js-stroopStimulus"></p>
                <div class="questionnaire-footer">
                    <button class="button js-stroopLeftButton">←</button>
                    <button class="button js-stroopUpButton">↑</button>
                    <button class="button js-stroopRightButton">→</button>
                </div>
            </div>
            <div class="cogtest-stage cogtest-stageHidden" data-stage="results">
                <p class="cogtest-stage-title">评估结果</p>
                <div class="js-cogtestResults"></div>
                <div class="questionnaire-footer">
                    <button class="button js-cogtestExportButton">导出数据</button>
                    <button class="button js-cogtestRestartButton">重新评估</button>
                    <button class="button js-cogtestDoneButton">完成并返回游戏</button>
                </div>
            </div>
        </div>
    </div>`;

const COGTEST_STAGES = ['intro', 'pvt', '2back', 'stroop', 'results'];
const PVT_TOTAL = 10;
const PVT_REACTION_TIMEOUT = 2000;
const PVT_REACTION_EARLY_MS = 120;
const PVT_DELAY_MIN_MS = 2000;
const PVT_DELAY_RANGE_MS = 4000;
const PVT_BETWEEN_TRIAL_MS = 700;
const NBACK_TOTAL = 12;
const NBACK_STEP_DURATION_MS = 3000;
const NBACK_MATCH_CHANCE = 0.35;
const STROOP_TOTAL = 10;
const STROOP_STEP_DURATION_MS = 1000;
const STROOP_CONFLICT_CHANCE = 0.75;
const NBACK_CALLSIGNS = ['CCA101', 'CES538', 'CSN312', 'CHH779'];
const NBACK_ALTITUDES = ['7200m', '7500m', '7800m', '8100m', '8400m', '8700m', '9000m'];

/**
 * @class QuestionnaireController
 */
export default class QuestionnaireController {
    constructor($element) {
        this._eventBus = EventBus;
        this.$element = $element;
        this.$dialog = null;
        this.$cogtestDialog = null;
        this._intervalId = null;
        this._lastTriggerGameTime = 0;
        this._cogtestCurrentStage = 'intro';
        this._cogtestData = {
            pvt: null,
            nback: null,
            stroop: null
        };

        this._pvtTrial = 0;
        this._pvtState = 'idle';
        this._pvtResults = [];
        this._pvtStartTime = 0;

        this._nbackSeq = [];
        this._nbackIndex = -1;
        this._nbackPlaying = false;
        this._nbackAwaitingResponse = false;
        this._nbackStepStartTime = 0;
        this._nbackStats = {
            correct: 0,
            totalValid: 0,
            rts: []
        };

        this._stroopTrial = 0;
        this._stroopTargetDirection = null;
        this._stroopPlaying = false;
        this._stroopAwaitingResponse = false;
        this._stroopStepStartTime = 0;
        this._stroopResults = [];

        this._timers = {
            pvtStart: null,
            pvtTimeout: null,
            pvtBetween: null,
            nbackStep: null,
            stroopStep: null
        };

        this._setupHandlers()
            .init()
            .enable();

        this.startInterval();
    }

    _setupHandlers() {
        this._onAirportChangeHandler = this.onAirportChange.bind(this);
        this._onCloseHandler = this.onClose.bind(this);
        this._onIntervalElapsedHandler = this._onIntervalElapsed.bind(this);
        this._onSubmitHandler = this.onSubmit.bind(this);
        this._onCogtestStartHandler = this.startExperiment.bind(this);
        this._onPvtResponseHandler = this.handlePvtResponse.bind(this, false);
        this._onNBackYesHandler = this.handleNBackResponse.bind(this, 'Y');
        this._onNBackNoHandler = this.handleNBackResponse.bind(this, 'N');
        this._onStroopLeftHandler = this.handleStroopResponse.bind(this, 'ArrowLeft');
        this._onStroopUpHandler = this.handleStroopResponse.bind(this, 'ArrowUp');
        this._onStroopRightHandler = this.handleStroopResponse.bind(this, 'ArrowRight');
        this._onCogtestExportHandler = this.exportData.bind(this);
        this._onCogtestRestartHandler = this.restartExperiment.bind(this);
        this._onCogtestDoneHandler = this.closeCogtestDialog.bind(this);
        this._onDocumentKeydownHandler = this._onDocumentKeydown.bind(this);

        return this;
    }

    init() {
        this.$dialog = $(UI_QUESTIONNAIRE_MODAL_TEMPLATE);
        this.$dialog.find('.questionnaire-question').text(QUESTIONNAIRE.QUESTION_TEXT);
        this._buildOptions();

        this.$dialog.find('.js-questionnaireSubmitButton').on('click', this._onSubmitHandler);
        this.$dialog.find('.js-questionnaireCloseButton').on('click', this._onCloseHandler);

        this.$cogtestDialog = $(UI_COGTEST_MODAL_TEMPLATE);
        this.$cogtestDialog.find('.js-cogtestStartButton').on('click', this._onCogtestStartHandler);
        this.$cogtestDialog.find('.js-pvtResponseButton').on('mousedown', this._onPvtResponseHandler);
        this.$cogtestDialog.find('.js-nbackYesButton').on('click', this._onNBackYesHandler);
        this.$cogtestDialog.find('.js-nbackNoButton').on('click', this._onNBackNoHandler);
        this.$cogtestDialog.find('.js-stroopLeftButton').on('click', this._onStroopLeftHandler);
        this.$cogtestDialog.find('.js-stroopUpButton').on('click', this._onStroopUpHandler);
        this.$cogtestDialog.find('.js-stroopRightButton').on('click', this._onStroopRightHandler);
        this.$cogtestDialog.find('.js-cogtestExportButton').on('click', this._onCogtestExportHandler);
        this.$cogtestDialog.find('.js-cogtestRestartButton').on('click', this._onCogtestRestartHandler);
        this.$cogtestDialog.find('.js-cogtestDoneButton').on('click', this._onCogtestDoneHandler);

        this.$element.append(this.$dialog);
        this.$element.append(this.$cogtestDialog);

        return this;
    }

    enable() {
        this._eventBus.on(EVENT.AIRPORT_CHANGE, this._onAirportChangeHandler);
        if (typeof document !== 'undefined') {
            $(document).off('keydown', this._onDocumentKeydownHandler);
            $(document).on('keydown', this._onDocumentKeydownHandler);
        }

        return this;
    }

    disable() {
        this._eventBus.off(EVENT.AIRPORT_CHANGE, this._onAirportChangeHandler);
        if (typeof document !== 'undefined') {
            $(document).off('keydown', this._onDocumentKeydownHandler);
        }

        return this;
    }

    isDialogOpen() {
        return this.$dialog.hasClass(SELECTORS.CLASSNAMES.OPEN);
    }

    isCogtestDialogOpen() {
        return this.$cogtestDialog.hasClass(SELECTORS.CLASSNAMES.OPEN);
    }

    startInterval() {
        if (!QUESTIONNAIRE.ENABLED) {
            return;
        }

        if (this._intervalId) {
            GameController.destroyTimer(this._intervalId);
        }

        this._intervalId = GameController.game_interval(
            this._onIntervalElapsedHandler,
            QUESTIONNAIRE.TRIGGER_INTERVAL_IN_SECONDS,
            this
        );
    }

    onAirportChange() {
        this.startInterval();
        this.closeCogtestDialog();
    }

    openDialog() {
        if (this.isDialogOpen()) {
            return;
        }

        this.$dialog.addClass(SELECTORS.CLASSNAMES.OPEN);
        GameController.game_pause();
    }

    closeDialog() {
        if (!this.isDialogOpen()) {
            return;
        }

        this.$dialog.removeClass(SELECTORS.CLASSNAMES.OPEN);
        GameController.game_unpause();
    }

    onClose(event) {
        event.preventDefault();
        this.closeDialog();
    }

    onSubmit(event) {
        event.preventDefault();

        const score = this._getSelectedScore();

        GameLogRecorder.recordQuestionnaireSubmit(score, this._lastTriggerGameTime);
        EventTracker.recordEvent(
            TRACKABLE_EVENT.SETTINGS,
            QUESTIONNAIRE.TRACKING_ACTION,
            `${QUESTIONNAIRE.SCALE_ID}:${score}`
        );

        this.closeDialog();
        this.openCogtestDialog();
    }

    openCogtestDialog() {
        if (this.isCogtestDialogOpen()) {
            return;
        }

        this.restartExperiment();
        this.$cogtestDialog.addClass(SELECTORS.CLASSNAMES.OPEN);
        GameController.game_pause();
    }

    closeCogtestDialog() {
        if (!this.isCogtestDialogOpen()) {
            return;
        }

        this._clearCogtestTimers();
        this.$cogtestDialog.removeClass(SELECTORS.CLASSNAMES.OPEN);
        GameController.game_unpause();
    }

    _buildOptions() {
        const $optionsContainer = this.$dialog.find('.questionnaire-options');

        for (let i = 0; i < QUESTIONNAIRE.SCALE_OPTIONS.length; i++) {
            const option = QUESTIONNAIRE.SCALE_OPTIONS[i];
            const checkedAttribute = option.value === QUESTIONNAIRE.DEFAULT_SCORE ? 'checked' : '';
            const template = `
                <label class="questionnaire-option">
                    <input type="radio" name="questionnaire-score" value="${option.value}" ${checkedAttribute}>
                    <span>${option.label}</span>
                </label>`;

            $optionsContainer.append(template);
        }
    }

    _getSelectedScore() {
        const selectedValue = this.$dialog.find('input[name="questionnaire-score"]:checked').val();
        const parsedValue = parseInt(selectedValue, 10);

        if (_isNaN(parsedValue)) {
            return QUESTIONNAIRE.DEFAULT_SCORE;
        }

        return parsedValue;
    }

    _onIntervalElapsed() {
        this._lastTriggerGameTime = TimeKeeper.accumulatedDeltaTime;
        this.openDialog();
    }

    startExperiment() {
        this.goToStage('pvt');
    }

    goToStage(stageName) {
        if (COGTEST_STAGES.indexOf(stageName) === -1) {
            return;
        }

        this.$cogtestDialog.find('.cogtest-stage').addClass('cogtest-stageHidden');
        this.$cogtestDialog.find(`.cogtest-stage[data-stage="${stageName}"]`).removeClass('cogtest-stageHidden');
        this._cogtestCurrentStage = stageName;

        if (stageName === 'pvt') {
            this.initPVT();
        }

        if (stageName === '2back') {
            this.initNBack();
        }

        if (stageName === 'stroop') {
            this.initStroop();
        }

        if (stageName === 'results') {
            this.renderResults();
        }
    }

    initPVT() {
        this._clearCogtestTimers();
        this._pvtTrial = 0;
        this._pvtState = 'idle';
        this._pvtResults = [];

        this.$cogtestDialog.find('.js-pvtStatus').text('等待信号变红后点击按钮');
        this.$cogtestDialog.find('.js-pvtCounter').text(`第 ${this._pvtTrial + 1}/${PVT_TOTAL} 次`);
        this.$cogtestDialog.find('.js-pvtResponseButton')
            .removeClass('cogtest-pvt-active')
            .text('等待信号...');

        this.triggerPvtStart();
    }

    triggerPvtStart() {
        this._pvtState = 'waiting';

        this.$cogtestDialog.find('.js-pvtStatus').text('请等待红色信号出现后立即点击');
        this.$cogtestDialog.find('.js-pvtCounter').text(`第 ${this._pvtTrial + 1}/${PVT_TOTAL} 次`);
        this.$cogtestDialog.find('.js-pvtResponseButton')
            .removeClass('cogtest-pvt-active')
            .text('等待信号...');

        const delay = (Math.random() * PVT_DELAY_RANGE_MS) + PVT_DELAY_MIN_MS;

        this._timers.pvtStart = window.setTimeout(() => {
            this._pvtState = 'running';
            this._pvtStartTime = performance.now();

            this.$cogtestDialog.find('.js-pvtStatus').text('立即点击按钮！');
            this.$cogtestDialog.find('.js-pvtResponseButton')
                .addClass('cogtest-pvt-active')
                .text('立即点击');

            this._timers.pvtTimeout = window.setTimeout(() => {
                this.handlePvtResponse(true);
            }, PVT_REACTION_TIMEOUT);
        }, delay);
    }

    handlePvtResponse(isTimeout = false) {
        if (this._cogtestCurrentStage !== 'pvt') {
            return;
        }

        if (this._pvtState === 'waiting') {
            window.clearTimeout(this._timers.pvtStart);
            this.recordPvtResult(0, '抢答');
            return;
        }

        if (this._pvtState !== 'running') {
            return;
        }

        window.clearTimeout(this._timers.pvtTimeout);

        const reactionTime = performance.now() - this._pvtStartTime;

        if (isTimeout || reactionTime > PVT_REACTION_TIMEOUT) {
            this.recordPvtResult(PVT_REACTION_TIMEOUT, '超时');
            return;
        }

        if (reactionTime < PVT_REACTION_EARLY_MS) {
            this.recordPvtResult(reactionTime, '抢答');
            return;
        }

        this.recordPvtResult(reactionTime, '正常');
    }

    recordPvtResult(reactionTime, type) {
        this._pvtState = 'idle';
        this.$cogtestDialog.find('.js-pvtStatus').text(`本次结果：${type}`);
        this.$cogtestDialog.find('.js-pvtResponseButton')
            .removeClass('cogtest-pvt-active')
            .text('等待下一次...');

        this._pvtResults.push({
            reactionTime,
            type,
            isError: type !== '正常'
        });

        this._timers.pvtBetween = window.setTimeout(() => {
            if (this._pvtTrial + 1 < PVT_TOTAL) {
                this._pvtTrial += 1;
                this.triggerPvtStart();
                return;
            }

            this.finishPVT();
        }, PVT_BETWEEN_TRIAL_MS);
    }

    finishPVT() {
        const validRTs = this._pvtResults
            .filter((result) => !result.isError)
            .map((result) => result.reactionTime);
        const totalValidRT = validRTs.reduce((total, value) => total + value, 0);
        const avgRT = validRTs.length > 0 ? Math.round(totalValidRT / validRTs.length) : 0;
        const errors = this._pvtResults.filter((result) => result.isError).length;
        const accuracy = Number((((PVT_TOTAL - errors) / PVT_TOTAL) * 100).toFixed(1));

        this._cogtestData.pvt = {
            avgRT,
            errors,
            accuracy
        };

        this.goToStage('2back');
    }

    generateATC2BackSeq(length) {
        const shuffled = [...NBACK_CALLSIGNS];

        for (let i = shuffled.length - 1; i > 0; i--) {
            const randomIndex = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[i]];
        }

        const selectedCallsigns = shuffled.slice(0, 2);
        const sequence = [];

        for (let i = 0; i < length; i++) {
            const callsign = selectedCallsigns[i % selectedCallsigns.length];
            let altitude = NBACK_ALTITUDES[Math.floor(Math.random() * NBACK_ALTITUDES.length)];

            if (i >= 2 && Math.random() < NBACK_MATCH_CHANCE) {
                const { altitude: matchedAltitude } = sequence[i - 2];

                altitude = matchedAltitude;
            }

            const isMatch = i >= 2 && altitude === sequence[i - 2].altitude;

            sequence.push({
                callsign,
                altitude,
                isMatch
            });
        }

        return sequence;
    }

    initNBack() {
        this._clearCogtestTimers();
        this._nbackSeq = this.generateATC2BackSeq(NBACK_TOTAL);
        this._nbackIndex = -1;
        this._nbackPlaying = false;
        this._nbackAwaitingResponse = false;
        this._nbackStats = {
            correct: 0,
            totalValid: 0,
            rts: []
        };

        this.startNBack();
    }

    startNBack() {
        this._nbackPlaying = true;
        this._nbackIndex = 0;
        this.runNBackStep();
    }

    runNBackStep() {
        if (this._nbackIndex >= NBACK_TOTAL) {
            this.endNBack();
            return;
        }

        const item = this._nbackSeq[this._nbackIndex];
        const isWarmup = this._nbackIndex < 2;

        this.$cogtestDialog.find('.js-nbackCounter').text(`第 ${this._nbackIndex + 1}/${NBACK_TOTAL} 项`);
        this.$cogtestDialog.find('.js-nbackStimulus').text(`${item.callsign} ｜ ${item.altitude}`);
        this.$cogtestDialog.find('.js-nbackPrompt').text(
            isWarmup ? '前两项用于记忆，不计分' : '请判断当前高度是否与该呼号两次前高度相同'
        );

        this._nbackAwaitingResponse = true;
        this._nbackStepStartTime = performance.now();
        this._timers.nbackStep = window.setTimeout(() => {
            this._finalizeNBackStep(null);
        }, NBACK_STEP_DURATION_MS);
    }

    handleNBackResponse(answer) {
        if (this._cogtestCurrentStage !== '2back' || !this._nbackPlaying || !this._nbackAwaitingResponse) {
            return;
        }

        this._finalizeNBackStep(answer);
    }

    _finalizeNBackStep(answer) {
        if (!this._nbackAwaitingResponse) {
            return;
        }

        window.clearTimeout(this._timers.nbackStep);
        this._nbackAwaitingResponse = false;

        if (this._nbackIndex >= 2) {
            const expected = this._nbackSeq[this._nbackIndex].isMatch ? 'Y' : 'N';
            const isCorrect = answer === expected;

            this._nbackStats.totalValid += 1;

            if (isCorrect) {
                this._nbackStats.correct += 1;
                this._nbackStats.rts.push(performance.now() - this._nbackStepStartTime);
            }
        }

        this._nbackIndex += 1;
        this.runNBackStep();
    }

    endNBack() {
        this._nbackPlaying = false;

        const { totalValid, correct, rts } = this._nbackStats;
        let accuracy = 0;

        if (totalValid > 0) {
            accuracy = Number(((correct / totalValid) * 100).toFixed(1));
        }
        const totalRT = rts.reduce((sum, value) => sum + value, 0);
        let avgRT = 0;

        if (rts.length > 0) {
            avgRT = Math.round(totalRT / rts.length);
        }

        this._cogtestData.nback = {
            accuracy,
            correct,
            totalTargets: totalValid,
            avgRT
        };

        this.finishNBack();
    }

    finishNBack() {
        this.goToStage('stroop');
    }

    initStroop() {
        this._clearCogtestTimers();
        this._stroopTrial = 0;
        this._stroopTargetDirection = null;
        this._stroopPlaying = false;
        this._stroopAwaitingResponse = false;
        this._stroopResults = [];

        this.startStroop();
    }

    startStroop() {
        this._stroopPlaying = true;
        this.runStroopStep();
    }

    runStroopStep() {
        if (this._stroopTrial >= STROOP_TOTAL) {
            this.endStroop();
            return;
        }

        const stimulus = this._buildStroopStimulus();

        this._stroopTargetDirection = stimulus.direction;
        this._stroopAwaitingResponse = true;
        this._stroopStepStartTime = performance.now();

        this.$cogtestDialog.find('.js-stroopCounter').text(`第 ${this._stroopTrial + 1}/${STROOP_TOTAL} 题`);
        this.$cogtestDialog.find('.js-stroopStimulus').text(`${stimulus.arrow} ${stimulus.word}`);

        this._timers.stroopStep = window.setTimeout(() => {
            this._finalizeStroopStep(null);
        }, STROOP_STEP_DURATION_MS);
    }

    handleStroopResponse(direction) {
        if (this._cogtestCurrentStage !== 'stroop' || !this._stroopPlaying || !this._stroopAwaitingResponse) {
            return;
        }

        this._finalizeStroopStep(direction);
    }

    _finalizeStroopStep(direction) {
        if (!this._stroopAwaitingResponse) {
            return;
        }

        window.clearTimeout(this._timers.stroopStep);
        this._stroopAwaitingResponse = false;

        const isCorrect = direction === this._stroopTargetDirection;
        let reactionTime = STROOP_STEP_DURATION_MS;

        if (direction !== null) {
            reactionTime = performance.now() - this._stroopStepStartTime;
        }

        this._stroopResults.push({
            reactionTime,
            isCorrect
        });

        this._stroopTrial += 1;
        this.runStroopStep();
    }

    _buildStroopStimulus() {
        const directions = ['ArrowLeft', 'ArrowUp', 'ArrowRight'];
        const arrowMap = {
            ArrowLeft: '←',
            ArrowUp: '↑',
            ArrowRight: '→'
        };
        const wordMap = {
            ArrowLeft: '左',
            ArrowUp: '上',
            ArrowRight: '右'
        };

        const direction = directions[Math.floor(Math.random() * directions.length)];
        const isConflict = Math.random() < STROOP_CONFLICT_CHANCE;
        const conflictOptions = directions.filter((item) => item !== direction);
        let wordDirection = direction;

        if (isConflict) {
            wordDirection = conflictOptions[Math.floor(Math.random() * conflictOptions.length)];
        }

        return {
            direction,
            arrow: arrowMap[direction],
            word: wordMap[wordDirection]
        };
    }

    endStroop() {
        this._stroopPlaying = false;

        const correctResults = this._stroopResults.filter((result) => result.isCorrect);
        const correctCount = correctResults.length;
        const totalCorrectRT = correctResults.reduce((sum, result) => sum + result.reactionTime, 0);

        this._cogtestData.stroop = {
            accuracy: Number(((correctCount / STROOP_TOTAL) * 100).toFixed(1)),
            avgRT: correctCount > 0 ? Math.round(totalCorrectRT / correctCount) : 0
        };

        this.goToStage('results');
    }

    renderResults() {
        const pvt = this._cogtestData.pvt || {};
        const nback = this._cogtestData.nback || {};
        const stroop = this._cogtestData.stroop || {};

        const html = [
            '<p><strong>PVT</strong></p>',
            `<p>平均反应时：${pvt.avgRT ?? 0} ms；错误次数：${pvt.errors ?? 0}；正确率：${pvt.accuracy ?? 0}%</p>`,
            '<p><strong>2-Back</strong></p>',
            `<p>正确数：${nback.correct ?? 0}/${nback.totalTargets ?? 0}；` +
                `正确率：${nback.accuracy ?? 0}%；平均反应时：${nback.avgRT ?? 0} ms</p>`,
            '<p><strong>Stroop</strong></p>',
            `<p>正确率：${stroop.accuracy ?? 0}%；平均反应时：${stroop.avgRT ?? 0} ms</p>`
        ];

        this.$cogtestDialog.find('.js-cogtestResults').html(html.join(''));
    }

    exportData() {
        const payload = {
            createdAt: new Date().toISOString(),
            result: this._cogtestData
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: 'application/json;charset=utf-8'
        });
        let url = null;

        try {
            url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `cogtest-result-${new Date().getTime()}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            this.$cogtestDialog.find('.js-cogtestResults').append('<p>导出失败，请检查浏览器下载权限。</p>');
            return;
        }

        if (url) {
            URL.revokeObjectURL(url);
        }
    }

    restartExperiment() {
        this._clearCogtestTimers();
        this._cogtestData = {
            pvt: null,
            nback: null,
            stroop: null
        };
        this.goToStage('intro');
    }

    _clearCogtestTimers() {
        const timerKeys = Object.keys(this._timers);

        for (let i = 0; i < timerKeys.length; i++) {
            const key = timerKeys[i];

            if (this._timers[key]) {
                window.clearTimeout(this._timers[key]);
                this._timers[key] = null;
            }
        }
    }

    _onDocumentKeydown(event) {
        if (!this.isCogtestDialogOpen()) {
            return;
        }

        if (this._cogtestCurrentStage === '2back') {
            if (event.key === 'y' || event.key === 'Y') {
                this.handleNBackResponse('Y');
            }

            if (event.key === 'n' || event.key === 'N') {
                this.handleNBackResponse('N');
            }

            return;
        }

        if (this._cogtestCurrentStage === 'stroop') {
            if (event.code === 'ArrowLeft' || event.code === 'ArrowUp' || event.code === 'ArrowRight') {
                this.handleStroopResponse(event.code);
            }
        }
    }
}
