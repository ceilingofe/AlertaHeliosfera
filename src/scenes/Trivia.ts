import Phaser from 'phaser';
import balance from '../../content/balance.json';
import uiText from '../../content/ui_text.json';
import { gameStore } from '../state/GameState';
import { Save } from '../state/Save';
import { bus } from '../state/bus';
import { AudioSystem } from '../systems/Audio';
import { Clock } from '../systems/Clock';
import { TRIVIA_PER_EXAM, questionsForDay, type TriviaQuestion } from '../systems/TriviaBank';
import { button, panel, txt } from '../minigames/widgets';

type Question = TriviaQuestion;

const T = uiText.trivia;
const PER_EXAM = TRIVIA_PER_EXAM;
const TIME_PER_Q = 25;

/**
 * Examen de la consola: 3 preguntas al día con tiempo límite.
 * Cada acierto da puntos de ciencia y 3/3 recupera una estrella de confianza de la Tierra.
 * Después de cada respuesta Corvi explica el porqué y la fuente (eso es lo que se aprende).
 */
export class Trivia extends Phaser.Scene {
  private questions: Question[] = [];
  private index = 0;
  private correct = 0;
  private timeLeft = TIME_PER_Q;
  private answered = false;
  private layer!: Phaser.GameObjects.Container;
  private timerFill!: Phaser.GameObjects.Rectangle;
  private optionBgs: Phaser.GameObjects.Rectangle[] = [];
  private keys: Phaser.Input.Keyboard.Key[] = [];
  private nextKey!: Phaser.Input.Keyboard.Key;
  private returnScene = 'Base';

  constructor() {
    super('Trivia');
  }

  init(data?: { returnScene?: string }): void {
    this.returnScene = data?.returnScene ?? 'Base';
  }

  create(): void {
    const state = gameStore.state;
    Clock.setPaused(state, true);
    AudioSystem.setMusicDuck(0.5);
    this.questions = questionsForDay(state.day);
    this.index = 0;
    this.correct = 0;
    this.add.rectangle(0, 0, 640, 360, 0x181425, 0.92).setOrigin(0, 0).setInteractive();
    panel(this, 20, 14, 600, 332);
    this.add.image(46, 40, 'corvi_think').setScale(0.7);
    txt(this, 72, 24, T.title, 16, '#fee761');
    txt(this, 72, 44, T.subtitle, 10, '#c0cbdc');
    this.layer = this.add.container(0, 0);

    const kb = this.input.keyboard;
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      this.keys = [kb.addKey(K.ONE), kb.addKey(K.TWO), kb.addKey(K.THREE), kb.addKey(K.FOUR)];
      this.nextKey = kb.addKey(K.SPACE);
    }
    this.showQuestion();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => AudioSystem.setMusicDuck(1));
  }

  private showQuestion(): void {
    this.layer.removeAll(true);
    this.optionBgs = [];
    this.answered = false;
    this.timeLeft = TIME_PER_Q;
    const q = this.questions[this.index];
    this.layer.add(txt(this, 560, 26, `${this.index + 1}/${PER_EXAM}`, 13, '#ffffff'));
    this.layer.add(txt(this, 40, 72, q.q, 14, '#ffffff', 560));
    this.layer.add(this.add.rectangle(40, 112, 560, 6, 0x3a4466).setOrigin(0, 0.5));
    this.timerFill = this.add.rectangle(40, 112, 560, 6, 0x2ce8f5).setOrigin(0, 0.5);
    this.layer.add(this.timerFill);

    q.options.forEach((opt, i) => {
      const y = 140 + i * 40;
      const b = button(this, 320, y, 560, 34, '', () => this.answer(i), 0x3a4466);
      b.label.destroy();
      this.optionBgs.push(b.bg);
      this.layer.add([b.bg, txt(this, 52, y - 7, `${i + 1}  ${opt}`, 12, '#ffffff', 530)]);
    });
    AudioSystem.play('ui_question', { volume: 0.6 });
  }

  private answer(i: number): void {
    if (this.answered) return;
    this.answered = true;
    const state = gameStore.state;
    const q = this.questions[this.index];
    const ok = i === q.answer;
    state.stats.triviaAsked += 1;
    if (ok) {
      this.correct += 1;
      state.stats.triviaCorrect += 1;
      state.sciencePoints += balance.science.triviaCorrect;
      AudioSystem.play('trivia_ok');
    } else {
      AudioSystem.play('trivia_bad');
      this.cameras.main.shake(140, 0.004);
    }
    this.optionBgs.forEach((bg, idx) => {
      bg.disableInteractive();
      if (idx === q.answer) bg.setFillStyle(0x3e8948).setStrokeStyle(2, 0x63c74d);
      else if (idx === i) bg.setFillStyle(0xa22633).setStrokeStyle(2, 0xe43b44);
    });

    const verdict = i < 0 ? T.timeOut : ok ? `${T.correct} +${balance.science.triviaCorrect} ${uiText.hud.sciencePointsShort}` : T.wrong;
    this.layer.add(this.add.rectangle(40, 300, 560, 40, 0xead4aa).setOrigin(0, 0.5).setStrokeStyle(2, 0x181425));
    this.layer.add(txt(this, 48, 284, `${verdict} ${q.explain}`, 10, '#181425', 450));
    this.layer.add(txt(this, 48, 324, `${T.sourcePrefix} ${q.source}`, 9, '#fee761'));
    const last = this.index >= PER_EXAM - 1;
    const b = button(this, 552, 300, 84, 30, last ? T.finish : T.next, () => this.next(), 0xf77622);
    this.layer.add([b.bg, b.label]);
  }

  private next(): void {
    if (!this.answered) return;
    AudioSystem.play('ui_click');
    this.index += 1;
    if (this.index < PER_EXAM) this.showQuestion();
    else this.showSummary();
  }

  private showSummary(): void {
    const state = gameStore.state;
    this.layer.removeAll(true);
    state.triviaDoneDay = state.day;
    const perfect = this.correct === PER_EXAM;
    let trustText = '';
    if (perfect && state.missionTrust < balance.mission.maxTrust) {
      state.missionTrust = Math.min(balance.mission.maxTrust, state.missionTrust + balance.mission.triviaPerfectTrustGain);
      trustText = T.trustUp;
    }
    Save.save(state);
    AudioSystem.play(perfect ? 'ui_confirm_big' : 'ui_confirm');
    this.layer.add(txt(this, 320, 110, `${this.correct} / ${PER_EXAM}`, 36, perfect ? '#63c74d' : '#fee761').setOrigin(0.5));
    this.layer.add(txt(this, 320, 160, perfect ? T.perfect : this.correct > 0 ? T.good : T.zero, 13, '#ffffff', 520).setOrigin(0.5));
    if (trustText) this.layer.add(txt(this, 320, 190, trustText, 12, '#fee761').setOrigin(0.5));
    this.layer.add(txt(this, 320, 220, T.comeBack, 10, '#c0cbdc').setOrigin(0.5));
    const b = button(this, 320, 280, 180, 34, T.close, () => this.close(), 0x63c74d, '#181425');
    this.layer.add([b.bg, b.label]);
    this.answered = true;
    this.index = PER_EXAM + 1;
  }

  private close(): void {
    Clock.setPaused(gameStore.state, false);
    bus.emit('trivia:finished', { correct: this.correct });
    if (this.scene.isPaused(this.returnScene)) this.scene.resume(this.returnScene);
    this.scene.stop();
  }

  update(_t: number, delta: number): void {
    if (this.index <= PER_EXAM - 1 && !this.answered) {
      this.timeLeft -= delta / 1000;
      this.timerFill.width = Math.max(0, (560 * this.timeLeft) / TIME_PER_Q);
      this.timerFill.setFillStyle(this.timeLeft < 6 ? 0xe43b44 : 0x2ce8f5);
      if (this.timeLeft <= 0) this.answer(-1);
      this.keys.forEach((k, i) => {
        if (Phaser.Input.Keyboard.JustDown(k)) this.answer(i);
      });
    } else if (this.nextKey && Phaser.Input.Keyboard.JustDown(this.nextKey)) {
      if (this.index > PER_EXAM) this.close();
      else this.next();
    }
  }
}
