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

/**
 * @class QuestionnaireController
 */
export default class QuestionnaireController {
    constructor($element) {
        /**
         * @property _eventBus
         * @type {EventBus}
         * @private
         */
        this._eventBus = EventBus;

        /**
         * Root DOM element
         *
         * @property $element
         * @type {jquery|HTML Element}
         */
        this.$element = $element;

        /**
         * @property $dialog
         * @type {jquery|HTML Element}
         * @default null
         */
        this.$dialog = null;

        /**
         * @property _intervalId
         * @type {array|Object|null}
         * @default null
         * @private
         */
        this._intervalId = null;

        /**
         * Game time (seconds) when the questionnaire was shown
         *
         * @property _lastTriggerGameTime
         * @type {number}
         * @default 0
         * @private
         */
        this._lastTriggerGameTime = 0;

        this._setupHandlers()
            .init()
            .enable();

        this.startInterval();
    }

    /**
     * @for QuestionnaireController
     * @method _setupHandlers
     * @chainable
     * @private
     */
    _setupHandlers() {
        this._onAirportChangeHandler = this.onAirportChange.bind(this);
        this._onCloseHandler = this.onClose.bind(this);
        this._onIntervalElapsedHandler = this._onIntervalElapsed.bind(this);
        this._onSubmitHandler = this.onSubmit.bind(this);

        return this;
    }

    /**
     * @for QuestionnaireController
     * @method init
     * @chainable
     */
    init() {
        this.$dialog = $(UI_QUESTIONNAIRE_MODAL_TEMPLATE);

        this.$dialog.find('.questionnaire-question').text(QUESTIONNAIRE.QUESTION_TEXT);
        this._buildOptions();

        this.$dialog.find('.js-questionnaireSubmitButton').on('click', this._onSubmitHandler);
        this.$dialog.find('.js-questionnaireCloseButton').on('click', this._onCloseHandler);

        this.$element.append(this.$dialog);

        return this;
    }

    /**
     * @for QuestionnaireController
     * @method enable
     * @chainable
     */
    enable() {
        this._eventBus.on(EVENT.AIRPORT_CHANGE, this._onAirportChangeHandler);

        return this;
    }

    /**
     * @for QuestionnaireController
     * @method disable
     * @chainable
     */
    disable() {
        this._eventBus.off(EVENT.AIRPORT_CHANGE, this._onAirportChangeHandler);

        return this;
    }

    /**
     * Returns whether the questionnaire dialog is open
     *
     * @for QuestionnaireController
     * @method isDialogOpen
     * @return {boolean}
     */
    isDialogOpen() {
        return this.$dialog.hasClass(SELECTORS.CLASSNAMES.OPEN);
    }

    /**
     * Register a recurring in-game timer for the fatigue questionnaire.
     *
     * @for QuestionnaireController
     * @method startInterval
     */
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

    /**
     * Event callback used to re-register the questionnaire timer
     * after airport changes clear game timers.
     *
     * @for QuestionnaireController
     * @method onAirportChange
     */
    onAirportChange() {
        this.startInterval();
    }

    /**
     * @for QuestionnaireController
     * @method openDialog
     */
    openDialog() {
        if (this.isDialogOpen()) {
            return;
        }

        this.$dialog.addClass(SELECTORS.CLASSNAMES.OPEN);
        GameController.game_pause();
    }

    /**
     * @for QuestionnaireController
     * @method closeDialog
     */
    closeDialog() {
        if (!this.isDialogOpen()) {
            return;
        }

        this.$dialog.removeClass(SELECTORS.CLASSNAMES.OPEN);
        GameController.game_unpause();
    }

    /**
     * @for QuestionnaireController
     * @method onClose
     * @param event {Event}
     */
    onClose(event) {
        event.preventDefault();

        this.closeDialog();
    }

    /**
     * @for QuestionnaireController
     * @method onSubmit
     * @param event {Event}
     */
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
        this._eventBus.trigger(EVENT.COGTEST_OPEN);
    }

    /**
     * @for QuestionnaireController
     * @method _buildOptions
     * @private
     */
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

    /**
     * @for QuestionnaireController
     * @method _getSelectedScore
     * @return {number}
     * @private
     */
    _getSelectedScore() {
        const selectedValue = this.$dialog.find('input[name="questionnaire-score"]:checked').val();
        const parsedValue = parseInt(selectedValue, 10);

        if (_isNaN(parsedValue)) {
            return QUESTIONNAIRE.DEFAULT_SCORE;
        }

        return parsedValue;
    }

    /**
     * @for QuestionnaireController
     * @method _onIntervalElapsed
     * @private
     */
    _onIntervalElapsed() {
        this._lastTriggerGameTime = TimeKeeper.accumulatedDeltaTime;
        this.openDialog();
    }
}
