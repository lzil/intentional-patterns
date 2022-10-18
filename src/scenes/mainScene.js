import { TypingText } from '../objects/typingtext'
import { Enum } from '../utils/enum'
import { clamp } from '../utils/clamp'
import { randint, randchoice, shuffle } from '../utils/rand'
import toPairs from '../utils/topairs'

import { shapeSimilarity } from 'curve-matcher';

import patterns4 from '../../public/patterns/p4.json'
import patterns6 from '../../public/patterns/p6.json'
import patterns8 from '../../public/patterns/p8.json'

const WHITE = 0xffffff
const GREEN = 0x39ff14 // actually move to the target
const RED = 0xff0000
const BLACK = 0x000000
// const BRIGHTRED = Phaser.Display.Color.GetColor(175, 50, 50)
const DARKGRAY = 0x333333
const GRAY = Phaser.Display.Color.GetColor(100, 100, 100)
// const LIGHTGRAY = Phaser.Display.Color.GetColor(150, 150, 150)
const LIGHTGRAY = 0x999999
const CYAN = Phaser.Display.Color.GetColor(100, 150, 250)
const SALMON = Phaser.Display.Color.GetColor(250, 100, 100)

const TEAL = 0x7DC0A6
const ORANGE = 0xED936B

const BRIGHTRED = 0xd40a0a
const BRIGHTGREEN = 0x24f49a

const ORIGIN_SIZE_RADIUS = 15
const MOVE_TIME_LIMIT = 900
const DRAW_TIME_LIMIT = 3000

const PATTERN_Y = -300
const DRAWING_Y = 200
const DRAWING_SIZE = 600
const CURSOR_Y = DRAWING_Y

const MAX_Y = DRAWING_Y + DRAWING_SIZE / 2
const MIN_Y = DRAWING_Y - DRAWING_SIZE / 2
const MAX_X = DRAWING_SIZE / 2
const MIN_X = -DRAWING_SIZE / 2

const SPEED_LIMIT = 1.5


const TRIAL_DELAY = 1200
const PRACTICE_TRIAL_PUNISH_DELAY = 200
const TRIAL_PUNISH_DELAY = 1500

const TASK_POINT_GOAL = 300

const states = Enum([
  'INSTRUCT', // show text instructions (based on stage of task)
  'PRETRIAL', // wait until ready to start trial
  'MOVING', // the movement part
  'POSTTRIAL', // auto teleport back to restore point
  'END' //
])

const Err = {
  none: 0,
  too_far: 1,
  too_slow_move: 2,
  too_slow_reach: 4,
  returned_reach: 8,
  too_fast_reach: 16
}

const DCols = {
  0: 0x22a4e0,
  1: 0xbd22e0,
  2: 0xe05e22
}

export default class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' })
    this._state = states.INSTRUCT
  }

  preload() {
    this.load.image('next', 'assets/next_instructions.png')
    this.load.image('next_debug', 'assets/next_debug.png')
    this.load.image('previous', 'assets/previous_instructions.png')
    this.load.image('finish', 'assets/ticket.png')
    this.load.image('brush', 'assets/brush2.png');


    // all the images of ids
    this.p4_ids = [0, 40, 41, 56]
    this.p6_ids = [13, 25, 70, 90, 96]
    this.p8_ids = [1, 21, 57, 60, 81]

    for (let i of this.p4_ids) {
      this.load.image(`4_${i}`, `patterns/figs_4/4_${i}.png`);
    }
    for (let i of this.p6_ids) {
      this.load.image(`6_${i}`, `patterns/figs_6/6_${i}.png`);
    }
    for (let i of this.p8_ids) {
      this.load.image(`8_${i}`, `patterns/figs_8/8_${i}.png`);
    }
  }

  create() {
    let config = this.game.config
    let user_config = this.game.user_config
    // camera (origin is center)
    this.hd2 = config.height/2
    this.wd2 = config.width/2
    this.cameras.main.setBounds(-this.wd2, -this.hd2, this.wd2*2, this.hd2*2)
    
    this.state = states.INSTRUCT
    this.entering = true
    this.all_trial_data = []

    // variables to start off with
    this.trial_counter = 0
    this.instruct_mode = 1
    this.points_count = 0
    // this.selection_counts = Array(3).fill(1/3)
    this.instructions_shown = false

    this.n_trials = 1000
    // this.difficulty = 5

    this.is_debug = user_config.is_debug
    if (this.is_debug) {
      this.instruct_mode = 1
      this.n_trials = 50
      this.difficulty = 4
    }

    // drawing elements
    this.pattern_border = this.add.rectangle(0, PATTERN_Y, 280, 280, DARKGRAY)
    this.pattern = this.add.image(0, PATTERN_Y, '8_81').setScale(.5)
    this.canvas = this.add.rectangle(0, DRAWING_Y, DRAWING_SIZE, DRAWING_SIZE, WHITE).setStrokeStyle(10, DARKGRAY)

    // shape question elements
    this.shapeQuestion = this.add.text(0, -120, '', {fontFamily: 'Verdana', fontSize: 50, color: DARKGRAY, align: 'center'})
      .setOrigin(.5,.5)
    this.shapeResponse = this.add.rexBBCodeText(0, 120, '', {fontFamily: 'Verdana', fontSize: 50, color: DARKGRAY, align: 'center'})
      .setOrigin(.5,.5)

    // circle people move their cursor to in order to start trial
    this.origin_obj = this.add.circle(0, CURSOR_Y, ORIGIN_SIZE_RADIUS, LIGHTGRAY).setDepth(1).setVisible(true)
    this.origin = new Phaser.Geom.Circle(0, CURSOR_Y, ORIGIN_SIZE_RADIUS) // NOT AN OBJECT

    // next and finish buttons
    this.arrow_next = this.add.image(400, 450, 'next')
      .setScale(.2)
      .setAlpha(.7)
    this.finish = this.add.rectangle(this.wd2,this.hd2,50,50)
      .setInteractive()
      .on('pointerdown',()=>{this.scene.start('EndScene', this.all_trial_data)})


    // fancy "INSTRUCTIONS" title
    this.instructions_title_group = this.add.group()
    this.instructions_title_group.add(this.add.rectangle(-315, -485, 425, 80, TEAL, 0.9))
    this.instructions_title_group.add(this.add.rectangle(-300, -470, 425, 80, ORANGE, 0.9))
    this.instructions_title_group.add(this.add.rexBBCodeText(-500, -500, 'INSTRUCTIONS', {
      fontFamily: 'Verdana',
      fontSize: 50,
      align: 'left',
      color: WHITE
    }))

    // secret finish button

    let instructions_font_params = {
      fontFamily: 'Verdana', 
      fontSize: 30,
      color: DARKGRAY,
      align: 'left'
    }

    this.instructions_group_1 = this.add.group()
    this.instructions_group_1.add(this.add.rexBBCodeText(-500, -350,
      `[b]In this game[/b], you'll draw patterns going from [color=#7DC0A6][b]teal[/b][/color] to [color=#ED936B][b]orange[/b][/color].`,
      instructions_font_params))
    this.instructions_group_1.add(this.add.rexBBCodeText(-500, -220,
      "Here's an example of a pattern:",
      instructions_font_params))
    this.instructions_group_1.add(this.add.image(100, -210, '4_0').setScale(.3))
    this.instructions_group_1.add(this.add.rectangle(100, -210, 170,170, DARKGRAY).setDepth(-1))
    // this.instructions_group_1.add(this.add.rectangle(-450, -260, 100, 10, WHITE).setVisible(false))
    this.instructions_group_1.add(this.add.rexBBCodeText(-500, -100,
      'Start a trial by moving your mouse to the [color=#999999][b]gray[/b][/color] circle. The\n[color=#999999][b]gray[/b][/color] circle will turn [b][color=#7DC0A6]teal[/color][/b] and your mouse will disappear.\nNow try to draw the pattern.',
      instructions_font_params))
    
    this.instructions_group_1.add(this.add.rexBBCodeText(-500, 50,
      'Once you finish, or time runs out, you\'ll see your score.\nThe better your drawing, the higher your score.',
      instructions_font_params))
    this.instructions_group_1.add(this.add.rexBBCodeText(-500, 160,
      'If you see shapes like these pop up, [b]remember them![/b]\n\n\n\nYou\'ll be asked about them after you draw.',
      instructions_font_params))
    this.instructions_group_1.add(this.add_colorshape(DCols[0], 0, [-450, 250]))
    this.instructions_group_1.add(this.add_colorshape(DCols[1], 1, [-300, 250]))
    this.instructions_group_1.add(this.add_colorshape(DCols[2], 2, [-150, 250]))
    this.instructions_group_1.add(this.add.rexBBCodeText(-500, 390,
      '[b]Let\'s start with some practice rounds.[/b]',
      instructions_font_params))

    // instructions during practice rounds
    this.instructions_holdwhite = this.add.text(50, 430, '<<   Move your mouse here', instructions_font_params).setVisible(false)
    this.instructions_moveup = this.add.text(100, 300, 'Move your mouse upwards...', instructions_font_params).setVisible(false)
    this.instructions_hitred = this.add.text(0, -550, 'Hit one of these targets!', {
      fontFamily: 'Verdana',
      fontSize: 30,
      align: 'center'
    }).setVisible(false).setOrigin(0.5, 0.5)

    // practice round trials
    // let trial_params_1 = {
    //   n_trials: 10,
    //   difficulty: 0,
    //   probe_prob: 0,
    // }
    // this.practice_trials_1 = generateTrials(trial_params_1)
    

    // second page of instructions, before starting
    this.instructions_group_2 = this.add.group()
    this.instructions_group_2.add(this.add.rexBBCodeText(-500, -300,
      '[b]Good job![/b]\n\nNow, the actual game will be more difficult. You will have\na time limit to move, so you won\'t be able to explore much.\nJust try your best!',
      instructions_font_params).setVisible(false))
    this.instructions_group_2.add(this.add.rexBBCodeText(-500, -60,
      'All three targets have the same chance of being [b][color=#FFAA00]gold[/color][/b].',
      instructions_font_params).setVisible(false))
    this.instructions_group_2.add(this.add.rexBBCodeText(-500, 40,
      `The task will end once you reach [b][color=#39ff14]${TASK_POINT_GOAL}[/color][/b] points.`,
      instructions_font_params).setVisible(false))
    this.instructions_group_2.add(this.add.rexBBCodeText(-500, 170,
      '[b]Once you are ready, click the arrow to begin.[/b]',
      instructions_font_params).setVisible(false))

    // text in the center displaying rewards and errors
    this.rewardText = this.add.
      text(0, 550, '', {
        fontFamily: 'Verdana',
        fontSize: 50,
        color: DARKGRAY,
        align: 'center'
      }).
      setOrigin(0.5, 0.5)

    // points counter in upper right hand corner
    this.points_txt = this.add.text(
      this.wd2 - 100, 100 -this.hd2, '', {fontSize: 30})
    .setOrigin(1, 0)


    // actual trials for the experiment

    // some easy trials
    // let trial_params = {
    //   n_trials: this.n_trials,
    //   distance_mode: this.distance_mode,
    //   difficulty: 0,
    //   probe_prob: this.probe_prob,
    //   n_targets: 3,
    // }
    // this.trials = generateTrials(trial_params)


    // let trial_params = {
    //   n_trials: this.n_trials,
    //   difficulty: this.difficulty,
    //   probe_prob: this.probe_prob,
    // }
    // this.trials = generateTrials(trial_params)

  } // end create


  show_instructions(mode) {
    this.pattern.setVisible(false)
    this.pattern_border.setVisible(false)
    this.canvas.setVisible(false)
    this.origin_obj.setVisible(false)


    this.instructions_title_group.setVisible(true)
    // this.arrow_back.setVisible(false)
    this.arrow_next.setVisible(true)
      .setInteractive()
      .setAlpha(0.7)
      .on('pointerover', () => {
        this.arrow_next.setAlpha(1)
      }).on('pointerout', () => {
        this.arrow_next.setAlpha(0.7)
      })
    let group;
    if (mode === 1) {
      group = this.instructions_group_1
    } else if (mode === 2) {
      group = this.instructions_group_2
    }
    group.setVisible(true)
    this.arrow_next.on('pointerdown', () => {
      this.arrow_next.setVisible(false).removeAllListeners()
      this.instructions_title_group.setVisible(false)
      group.setVisible(false)
      this.trial_success_count = 0
      this.cur_trial_ix = -1
      this.next_trial()
    })
  }

  add_colorshape(color, shapeid, pos) {
    let shape;
    if (shapeid == 0) {
      shape = this.add.rectangle(pos[0], pos[1], 50, 50, color, 0).setStrokeStyle(10, color)
    } else if (shapeid == 1) {
      shape = this.add.circle(pos[0], pos[1], 25, color, 0).setStrokeStyle(10, color)
    } else if (shapeid == 2) {
      shape = this.add.triangle(pos[0], pos[1], 25, 0, 0, 25 * Math.sqrt(3), 50, 25 * Math.sqrt(3)).setStrokeStyle(10, color)
    }
    return shape
  }

  create_distractors(colors, shapes) {
    let positions = shuffle([[-380, 0], [-380, 400], [380, 0], [380, 400]])
    let notChosen = randchoice([0,1,2,3])

    for (let i = 0; i < 4; i++) {
      if (i == notChosen) continue;
      let pos = positions[i]

      let shapeid, color;
      if (i == 0) {
        shapeid = shapes[0]
        color = DCols[colors[0]]
      } else if (i == 1) {
        shapeid = shapes[0]
        color = DCols[colors[1]]
      } else if (i == 2) {
        shapeid = shapes[1]
        color = DCols[colors[0]]
      } else if (i == 3) {
        shapeid = shapes[1]
        color = DCols[colors[1]]
      }
      this.distractors.push(this.add_colorshape(color, shapeid, pos))
    }

    return notChosen
  }

  show_colorshapes(colors, shapes) {
    let positions = [[-200, 0], [-66, 0], [66, 0], [200, 0]]

    for (let i = 0; i < 4; i++) {
      let pos = positions[i]

      let shapeid, color;
      if (i == 0) {
        shapeid = shapes[0]
        color = DCols[colors[0]]
      } else if (i == 1) {
        shapeid = shapes[0]
        color = DCols[colors[1]]
      } else if (i == 2) {
        shapeid = shapes[1]
        color = DCols[colors[0]]
      } else if (i == 3) {
        shapeid = shapes[1]
        color = DCols[colors[1]]
      }
      this.colorshapes.push(this.add_colorshape(color, shapeid, pos))
    }

  }

  choose_cs_subset() {
    let choices = [0,1,2]
    let colors = shuffle(choices).slice(1)
    let shapes = shuffle(choices).slice(1)

    return {'colors': colors, 'shapes': shapes}
  }

  update() {
    switch (this.state) {
    case states.INSTRUCT:
      
      if (this.entering) {
        this.entering = false
        console.log("Entering INSTRUCT")
        // this.reset_screen()
        this.show_instructions(this.instruct_mode, this.instructions_shown)

        this.cur_trial_ix = 0
        
      }
      // this.state = states.PRETRIAL

      break
    case states.PRETRIAL:
      if (this.entering) {
        this.entering = false
        console.log("Entering PRETRIAL")
        // this.difficulty_factor = this.current_trial.difficulty || 1
        // how long you have to be inside circle to start trial
        this.hold_val = randint(300, 600)
        // this.reset_targets()

        this.shapeQuestion.setVisible(false)
        this.shapeResponse.setVisible(false)
        this.rewardText.setVisible(false)

        this.pattern.setVisible(true)
        this.pattern_border.setVisible(true)
        this.canvas.setVisible(true)
        this.origin_obj.setVisible(true).setFillStyle(LIGHTGRAY)
        

        this.hold_waiting = false
        
        this.distractors = []
        this.colorshapes = []
        // if (this.instruct_mode === 1) {
        //   this.instructions_holdwhite.setVisible(true)
        //   this.arrow_back.setVisible(true)
        // }

        this.pretrial_time = this.game.loop.now
        this.trial_data = {}
        this.trial_data['ix'] = this.cur_trial_ix
        // this.trial_data['trial'] = this.current_trial
        // this.trial_data['type'] = this.current_trial.type
        // if (this.instruct_mode === 1) {
        //   this.trial_data['set'] = 'practice'
        // } else {
        //   this.trial_data['set'] = 'main'
        // }
        this.pointer_data = {'time': [], 'x': [], 'y': []}
        
      }

      // check if cursor inside start circle
      // console.log(this.input.activePointer.x-this.wd2, this.origin.x, this.input.activePointer.y-this.hd2, this.origin.y)
      let mouse_in_origin = this.origin.contains(
        this.input.activePointer.x - this.wd2,
        this.input.activePointer.y - this.hd2)
      if (mouse_in_origin && !this.hold_waiting) {
        this.hold_start_time = this.game.loop.now
        this.hold_waiting = true;
      } else if (!mouse_in_origin && this.hold_waiting) {
        this.hold_waiting = false;
      }

      // wait for cursor inside start circle
      if (this.hold_waiting) {
        if (this.game.loop.now - this.hold_start_time > this.hold_val) {
          this.hold_waiting = false;
          this.state = states.MOVING
        }
      }
      
      break

    case states.MOVING:
      if (this.entering) {
        this.entering = false
        this.moving = false
        console.log("Entering MOVING")

        this.origin_obj.setFillStyle(TEAL)

        // start time is when the circle turns green
        // start time != target show time. record all timestamps anyway, relative to start time
        this.start_time = this.game.loop.now
        this.trial_data['start_time_abs'] = this.start_time
        this.trial_data['pretrial_time'] = this.pretrial_time - this.start_time
        console.log(this.trial_data['pretrial_time'], 'pretrial_time')
        console.log(0, 'start_time')

        this.draw_points = []

        // instructions guiding movements
        // if (this.instruct_mode === 1) {
        //   this.instructions_holdwhite.setVisible(false)
        //   this.instructions_hitred.setVisible(true)
        //   if (!this.distance_mode) {
        //     this.instructions_moveup.setVisible(true)
        //   }
        // }
        // this.input.on('pointermove', function (pointer) {
        //   var points = pointer.getInterpolatedPosition(20);
        //   for (let p of points) {
        //       let circ = this.add.circle(p.x, p.y, 5, LIGHTGRAY).setOrigin(0, 0)
        //       // this.rt.draw(circ, p.x, p.y, 1, BLACK);
        //   };
        // }, this);
      }



      // // main loop, executed always
      let cur_time = this.game.loop.now
      let pointerx = this.input.activePointer.x - this.wd2
      let pointery = this.input.activePointer.y - this.hd2
      let cur_trial_time = cur_time - this.start_time

      var points = this.input.activePointer.getInterpolatedPosition(20);
      for (let p of points) {
        let px = p.x - this.wd2
        let py = p.y - this.hd2
        // px = Math.max(MIN_X, Math.min(MAX_X, px))
        // py = Math.max(MIN_Y, Math.min(MAX_Y, py))
        this.draw_points.push(this.add.image(px, py, 'brush').setTint(LIGHTGRAY).setScale(.5))
      };

      // has participant started moving yet?
      if (!this.moving) {
        let mouse_in_origin = this.origin.contains(pointerx, pointery)

        // participant just moved!
        if (!mouse_in_origin) {
          console.log('moving')
          this.moving = true
          this.move_time = cur_time
          this.trial_data['move_time'] = cur_trial_time
          console.log(cur_trial_time, 'move_time')

          this.cs_ids = this.choose_cs_subset()
          console.log(this.cs_ids)
          this.shapeAnswer = this.create_distractors(this.cs_ids['colors'], this.cs_ids['shapes'])

          // if (this.instruct_mode === 1) {
          //   this.instructions_hitred.setVisible(true)
          // }
        }

        // not moving and we're overtime
        if (!this.moving && cur_trial_time > MOVE_TIME_LIMIT) {
          console.log('TOO_SLOW_MOVE')
          this.trial_error = Err.too_slow_move
          this.move_time = -1
          this.state = states.POSTTRIAL
        }
      }

      // once we're moving...
      if (this.moving) {
        // time, x, y
        this.pointer_data.time.push(cur_trial_time)
        this.pointer_data.x.push(pointerx)
        this.pointer_data.y.push(pointery)

        let drawing_time = cur_time - this.move_time

        let plen = this.pointer_data.x.length
        let p5x = this.pointer_data.x[plen - 5]
        let p5y = this.pointer_data.y[plen - 5]
        if (drawing_time > 600 && p5x == pointerx && p5y == pointery) {
          console.log('STOPPED_MOVEMENT')
          this.trial_error = Err.none
          this.state = states.POSTTRIAL
        }

        // reached drawing limit time. not an error
        if (drawing_time > DRAW_TIME_LIMIT) {
          console.log('DRAW_TIME_LIMIT')
          this.trial_error = Err.none
          this.state = states.POSTTRIAL
        }

        // are we past the reaching time limit?
        // let time_lim = REACH_TIME_LIMIT
        // if (this.instruct_mode > 0) {
        //   time_lim = PRACTICE_REACH_TIME_LIMIT
        // }
        // if (reaching_trial_time > time_lim) {
        //   console.log('hit the limit!', reaching_trial_time)
        //   this.trial_error = Err.too_slow_reach
        //   this.state = states.POSTTRIAL
        // }

      }

      this.prev_time = cur_time

      break

    case states.POSTTRIAL:
      if (this.entering) {
        console.log("Entering POSTTRIAL")
        this.entering = false

        for (let p of this.draw_points) {
          p.destroy()
        }
        for (let p of this.distractors) {
          p.destroy()
        }
        this.origin_obj.setVisible(false)

        // calculate score
        let y0 = this.pointer_data.y[0]
        let user_p = [this.pointer_data.x, this.pointer_data.y.map(y => -(y - y0))]
        let real_p = [patterns8['81'][0].map(x => x * DRAWING_SIZE), patterns8['81'][1].map(y => y * DRAWING_SIZE)]
        let pairs = toPairs(user_p, real_p)
        let score = shapeSimilarity(pairs[0], pairs[1], { estimationPoints: 80, checkRotations: false });
        score = Math.pow(score, 2)
        console.log(score)

        this.score = Math.round(score * 1000) / 10

        // console.log(user_p, real_p)
        // console.log(score(user_p, real_p))
        // console.log(user_p)
        // console.log(real_p)

        // if (this.instruct_mode === 1) {
        //   this.instructions_hitred.setVisible(false)
        // }
        // this.origin_obj.fillColor = WHITE
        this.end_time = this.game.loop.now
        // gives incorrect results if we didn't move this trial
        this.trial_data['end_time'] = this.end_time - this.start_time
        this.trial_data['trial_time'] = this.end_time - this.move_time
        console.log(this.trial_data['trial_time'], 'trial time')

        this.trial_data['pointer_data'] = this.pointer_data
        // console.log(this.trial_data)

        let punish_delay = 0
        if (this.trial_error === Err.none) {
          // no error happened
          let rewardText = `Your shape score was ${this.score}.`
          this.rewardText.setText(rewardText)
        } else {
          // some error happened
          if (this.instruct_mode == 1) {
            this.trial_success_count = 0
          }
          this.reward = 0
          this.selection = -1
          this.value = 0
          if (this.trial_error === Err.too_slow_move) {
            this.rewardText.setText('Please start your movement faster.')
          } else if (this.trial_error === Err.too_slow_reach) {
            this.rewardText.setText('Too slow!')
          } else if (this.trial_error === Err.too_far || this.trial_error === Err.returned_reach) {
            this.reset_targets()
            this.rewardText.setText('Move your cursor toward one of the targets.')
          } else if (this.trial_error === Err.too_fast_reach) {
            this.reset_targets()
            this.rewardText.setText('Please move the cursor slower.')
          }

          punish_delay = TRIAL_PUNISH_DELAY
          if (this.instruct_mode > 0) {
            punish_delay = PRACTICE_TRIAL_PUNISH_DELAY
          }
        }
        this.rewardText.setVisible(true)
        if (this.instruct_mode === 0) {
          this.points_count += this.reward
          this.points_txt.setText('Points: ' + this.points_count)
        }
        

        this.trial_data['error'] = this.trial_error
        this.trial_data['reward'] = this.reward

        this.all_trial_data.push(this.trial_data)

        console.log(`reward: ${this.reward}; success count: ${this.trial_success_count}`)

        this.time.delayedCall(TRIAL_DELAY, () => {
          this.state = states.SHAPES
        })

        // next trial, delay based on punishment
        // this.time.delayedCall(punish_delay, () => {

        // })
      }
      break
    case states.SHAPES:
      if (this.entering) {
        this.entering = false
        this.pattern.setVisible(false)
        this.pattern_border.setVisible(false)
        this.canvas.setVisible(false)
        this.rewardText.setVisible(false)

        this.shapeQuestion.setText('Click on the shape missing from the drawing phase:').setVisible(true)
        this.show_colorshapes(this.cs_ids['colors'], this.cs_ids['shapes'])

        for (let i = 0; i < 4; i++) {
          this.colorshapes[i].setInteractive()
            .on('pointerover', () => this.game.canvas.style.cursor = 'pointer' )
            .on('pointerout', () => this.game.canvas.style.cursor = 'default' )
          if (i == this.shapeAnswer) {
            this.colorshapes[i].on('pointerdown', () => {
              this.shapeResponse.setText('Correct!').setStyle({color: BRIGHTGREEN}).setVisible(true)
              this.time.delayedCall(TRIAL_DELAY, () => {
                for (let p of this.colorshapes) {
                  p.destroy()
                }
                if (this.points_count >= TASK_POINT_GOAL) {
                  this.state = states.END
                } else {
                  this.next_trial()
                }
              })
            })
          } else {
            this.colorshapes[i].on('pointerdown', () => {
              this.shapeResponse.setText('Incorrect :(').setStyle({color: BRIGHTRED}).setVisible(true)
              this.time.delayedCall(TRIAL_PUNISH_DELAY, () => {
                for (let p of this.colorshapes) {
                  p.destroy()
                }
                if (this.points_count >= TASK_POINT_GOAL) {
                  this.state = states.END
                } else {
                  this.next_trial()
                }
              })
            })
          }
        }

        
      }
      break
    case states.END:
      if (this.entering) {
        this.entering = false
        this.scene.start('EndScene', this.all_trial_data)
      }
      break
    }
  } // end update

  get state() {
    return this._state
  }

  set state(newState) {
    this.entering = true
    this._state = newState
  }

  next_trial() {
    // if (this.instruct_mode === 1) {
    //   // console.log(this.trial_success_count)
    //   if (this.trial_success_count >= 4) {
    //     this.instruct_mode = 2
    //     this.state = states.INSTRUCT
    //     return
    //   }
    //   this.cur_trial_ix = (this.cur_trial_ix + 1) % this.practice_trials_1.length
    //   this.current_trial = this.practice_trials_1[this.cur_trial_ix]
    // } else {
    //   if (this.instruct_mode === 2) {
    //     this.instruct_mode = 0
    //   }
    //   this.cur_trial_ix += 1
    //   if (this.cur_trial_ix >= this.trials.length) {
    //     this.state = states.END
    //     return
    //   } else {
    //     this.current_trial = this.trials[this.cur_trial_ix]
    //   }
      
    // }

    this.state = states.PRETRIAL
  }
}
