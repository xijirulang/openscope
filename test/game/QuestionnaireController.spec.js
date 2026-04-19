import ava from 'ava';
import $ from 'jquery';
import sinon from 'sinon';
import EventBus from '../../src/assets/scripts/client/lib/EventBus';
import EventTracker from '../../src/assets/scripts/client/EventTracker';
import TimeKeeper from '../../src/assets/scripts/client/engine/TimeKeeper';
import GameController from '../../src/assets/scripts/client/game/GameController';
import GameLogRecorder from '../../src/assets/scripts/client/gamelog/GameLogRecorder';
import QuestionnaireController from '../../src/assets/scripts/client/ui/QuestionnaireController';
import { EVENT } from '../../src/assets/scripts/client/constants/eventNames';
import { QUESTIONNAIRE } from '../../src/assets/scripts/client/constants/QuestionnaireConstants';

let sandbox;
let $element;
let controller;
let intervalCallback;

ava.beforeEach(() => {
    EventBus.destroy();
    TimeKeeper.reset();

    sandbox = sinon.createSandbox();
    intervalCallback = null;
    $element = $('<div id="questionnaire-test-root"></div>');
    $('body').append($element);

    sandbox.stub(GameController, 'game_interval').callsFake((callback) => {
        intervalCallback = callback;

        return {
            id: 'questionnaire-timer'
        };
    });
    sandbox.stub(GameController, 'destroyTimer');
    sandbox.stub(GameController, 'game_pause');
    sandbox.stub(GameController, 'game_unpause');
    sandbox.spy(EventBus, 'trigger');
    sandbox.stub(EventTracker, 'recordEvent');
    sandbox.stub(GameLogRecorder, 'recordQuestionnaireSubmit');
});

ava.afterEach.always(() => {
    if (controller) {
        controller.disable();
    }

    if ($element) {
        $element.remove();
    }

    TimeKeeper.reset();
    EventBus.destroy();

    sandbox.restore();

    controller = null;
    $element = null;
    intervalCallback = null;
});

ava.serial('interval trigger opens questionnaire and pauses simulation', (t) => {
    controller = new QuestionnaireController($element);

    t.true(GameController.game_interval.calledOnce);
    t.true(GameController.game_interval.calledWithMatch(
        sinon.match.func,
        QUESTIONNAIRE.TRIGGER_INTERVAL_IN_SECONDS,
        controller
    ));

    intervalCallback.call(controller);

    t.true(controller.isDialogOpen());
    t.true(GameController.game_pause.calledOnce);
});

ava.serial('closing resumes simulation and submit stores score in game log', (t) => {
    controller = new QuestionnaireController($element);

    intervalCallback.call(controller);
    controller.$dialog.find('input[name="questionnaire-score"][value="7"]').prop('checked', true);

    controller.onSubmit({ preventDefault: () => {} });

    t.true(GameLogRecorder.recordQuestionnaireSubmit.calledOnce);
    t.true(GameLogRecorder.recordQuestionnaireSubmit.calledWithExactly(7, 0));
    t.true(EventBus.trigger.calledWithExactly(EVENT.COGTEST_OPEN));
    t.true(GameController.game_unpause.calledOnce);
    t.false(controller.isDialogOpen());

    intervalCallback.call(controller);
    controller.onClose({ preventDefault: () => {} });

    t.true(GameController.game_unpause.calledTwice);
    t.false(controller.isDialogOpen());
});

ava.serial('airport change re-registers questionnaire interval', (t) => {
    controller = new QuestionnaireController($element);
    const firstTimer = controller._intervalId;

    EventBus.trigger(EVENT.AIRPORT_CHANGE);

    t.true(GameController.destroyTimer.calledWithExactly(firstTimer));
    t.true(GameController.game_interval.calledTwice);
});
