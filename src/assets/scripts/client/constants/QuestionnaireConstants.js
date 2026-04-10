import { TIME } from './globalConstants';

/* eslint-disable import/prefer-default-export */
/**
 * Constants used by the in-game fatigue questionnaire.
 *
 * @property QUESTIONNAIRE
 * @type {Object}
 * @final
 */
export const QUESTIONNAIRE = {
    ENABLED: true,
    SCALE_ID: 's-p7',
    TRACKING_ACTION: 'questionnaire-submit',
    TRIGGER_INTERVAL_IN_SECONDS: 1 * TIME.ONE_MINUTE_IN_SECONDS,
    QUESTION_TEXT: '请请评估你当前的疲劳程度.',
    DEFAULT_SCORE: 4,
    SCALE_OPTIONS: [
        {
            label: '1-极度警觉、完全清醒',
            value: 1
        },
        {
            label: '2-精力充沛，但已不在巅峰状态',
            value: 2
        },
        {
            label: '3-尚有一定活力',
            value: 3
        },
        {
            label: '4-略有疲惫、精力不足',
            value: 4
        },
        {
            label: '5-中度疲劳',
            value: 5
        },
        {
            label: '6-极度疲惫、难以集中注意力',
            value: 6
        },
        {
            label: '7-完全耗竭、筋疲力尽',
            value: 7
        }
    ]
};