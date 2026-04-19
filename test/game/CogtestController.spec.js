import ava from 'ava';
import $ from 'jquery';
import sinon from 'sinon';
import EventBus from '../../src/assets/scripts/client/lib/EventBus';
import GameController from '../../src/assets/scripts/client/game/GameController';
import CogtestController from '../../src/assets/scripts/client/ui/CogtestController';
import { EVENT } from '../../src/assets/scripts/client/constants/eventNames';

let sandbox;
let $element;
let controller;

ava.beforeEach(() => {
    EventBus.destroy();

    sandbox = sinon.createSandbox();
    $element = $('<div id="cogtest-test-root"></div>');
    $('body').append($element);

    sandbox.stub(GameController, 'game_pause');
    sandbox.stub(GameController, 'game_unpause');
});

ava.afterEach.always(() => {
    if (controller) {
        controller.disable();
    }

    if ($element) {
        $element.remove();
    }

    EventBus.destroy();
    sandbox.restore();

    controller = null;
    $element = null;
});

ava.serial('opens dialog when questionnaire submit event is emitted', (t) => {
    controller = new CogtestController($element);

    EventBus.trigger(EVENT.COGTEST_OPEN);

    t.true(controller.isDialogOpen());
    t.true(GameController.game_pause.calledOnce);
});

ava.serial('airport change closes open dialog', (t) => {
    controller = new CogtestController($element);

    EventBus.trigger(EVENT.COGTEST_OPEN);
    EventBus.trigger(EVENT.AIRPORT_CHANGE);

    t.false(controller.isDialogOpen());
    t.true(GameController.game_unpause.calledOnce);
});
