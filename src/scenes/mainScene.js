import { TypingText } from '../objects/typingtext'
import { Enum } from '../utils/enum'
import { clamp } from '../utils/clamp'

import { randint, randchoice } from '../utils/rand'
import generateTrials from '../utils/trialgen'
import score from '../utils/score'


const WHITE = 0xffffff
const GREEN = 0x39ff14 // actually move to the target
const RED = 0xff0000
const BLACK = 0x000000
const BRIGHTRED = Phaser.Display.Color.GetColor(175, 50, 50)
const DARKGRAY = 0x444444
const GRAY = Phaser.Display.Color.GetColor(100, 100, 100)
const LIGHTGRAY = Phaser.Display.Color.GetColor(150, 150, 150)
const CYAN = Phaser.Display.Color.GetColor(100, 150, 250)
const SALMON = Phaser.Display.Color.GetColor(250, 100, 100)
const ORANGE = 0xffa500

const TEAL = 0x7DC0A6

const TARGET_SIZE_RADIUS = 75
const ORIGIN_SIZE_RADIUS = 15
const MOVE_THRESHOLD = 4

const TARGET_DISTANCE = 850 // *hopefully* they have 300px available?
const TARGET_SHOW_DISTANCE = 800
const TARGET_REF_ANGLE = 270 // degrees, and should be pointed straight up
const TARGET_ANGLE = 50
const DRAW_TIME_LIMIT = 900
const PRACTICE_REACH_TIME_LIMIT = 20000
const REACH_TIME_LIMIT = 900
const CURSOR_Y = 100
const PATTERN_Y = -300

const SPEED_LIMIT = 1.5

const MED_TIME_MULTIPLIER = 2

const TRIAL_DELAY = 1000
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

    this.load.image('4_15', 'patterns/4_15.png');
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
      this.instruct_mode = 2
      this.n_trials = 50
      this.difficulty = 4
    }

    // this.rt = this.add.renderTexture(0, 0, 800, 600);
    // this.brush = this.textures.getFrame('brush');

    this.add.rectangle(0, PATTERN_Y, 280, 280, BLACK)
    this.pattern = this.add.image(0, PATTERN_Y, '4_15').setScale(.5)

    // this.input.on('pointermove', function (pointer) {
    //   var points = pointer.getInterpolatedPosition(20);
    //   for (let p of points) {
    //       let circ = this.add.circle(p.x, p.y, 5, LIGHTGRAY).setOrigin(0, 0)
    //       // this.rt.draw(circ, p.x, p.y, 1, BLACK);
    //   };
    // }, this);

    // fancy "INSTRUCTIONS" title
    // this.instructions_title_group = this.add.group()
    // this.instructions_title_group.add(this.add.rectangle(-310, -480, 425, 80, SALMON, 0.9))
    // this.instructions_title_group.add(this.add.rectangle(-300, -470, 425, 80, CYAN, 0.9))
    // this.instructions_title_group.add(this.add.text(-500, -500, 'INSTRUCTIONS', {
    //   fontFamily: 'Verdana',
    //   fontSize: 50,
    //   align: 'left'
    // }))

    // secret finish button
    this.finish = this.add.rectangle(this.wd2,this.hd2,50,50).setInteractive().on('pointerdown',()=>{this.scene.start('EndScene', this.all_trial_data)})

    // button to next set of instructions / next page
    // this.arrow_next = this.add.image(400, 450, 'next')
    //   .setScale(.2)
    //   .setAlpha(.7)
    // button back to instructions
    this.arrow_back = this.add.image(-450, 450, 'previous')
      .setScale(.2)
      .setAlpha(.7)
      .setInteractive()
      .on('pointerover', () => {
        this.arrow_back.setAlpha(1)
      }).on('pointerout', () => {
        this.arrow_back.setAlpha(0.7)
      })
      .setVisible(false)
      .on('pointerdown', () => {
        this.state = states.INSTRUCT
        this.instruct_mode = 1
        this.instructions_holdwhite.setVisible(false)
        this.instructions_moveup.setVisible(false)
        this.instructions_hitred.setVisible(false)
        this.arrow_back.setVisible(false)
        this.reset_targets()
        this.origin_obj.setVisible(false)
        this.trial_success_count = 0

      })

    let instructions_font_params = {
      fontFamily: 'Verdana', 
      fontSize: 30,
      fontColor: BLACK,
      align: 'left'
    }

    this.instructions_group_1 = this.add.group()
    this.instructions_group_1.add(this.add.rexBBCodeText(-500, -350,
      '[b]In this game[/b], score points by moving a cursor to circular targets.',
      instructions_font_params).setVisible(false))
    this.instructions_group_1.add(this.add.rectangle(-450, -260, 100, 10, WHITE).setVisible(false))
    this.instructions_group_1.add(this.add.rexBBCodeText(-500, -210,
      'Start a trial by moving your mouse to a [b]white[/b] circle at the\nbottom of the screen.',
      instructions_font_params).setVisible(false))
    this.instructions_group_1.add(this.add.rexBBCodeText(-500, -100,
      'The [b]white[/b] circle will turn [b][color=#39ff14]green[/color][/b], and three targets will appear\nnear the top of the screen. The [b][color=#FFAA00]gold target is worth 3 points[/color][/b],\nand the [b][color=#DD3232]red targets are worth 1 point[/color][/b].',
      instructions_font_params).setVisible(false))
    this.instructions_group_1.add(this.add.rexBBCodeText(-500, 40,
      'Move the cursor to a target to select it. The cursor will\nautomatically follow your mouse, but it has a maximum speed.',
      instructions_font_params).setVisible(false))
    this.instructions_group_1.add(this.add.rectangle(-450, 160, 100, 10, WHITE).setVisible(false))
    this.instructions_group_1.add(this.add.rexBBCodeText(-500, 210,
      '[b]The catch[/b]: your vision is limited, and targets far from your\ncursor will be hard to see.',
      instructions_font_params).setVisible(false))
    this.instructions_group_1.add(this.add.rexBBCodeText(-500, 340,
      'Let\'s start with some practice rounds.',
      instructions_font_params).setVisible(false))

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
    this.reward_txt = this.add.
      text(0, 0, '', {
        fontFamily: 'Verdana',
        fontSize: 50,
        align: 'center'
      }).
      setOrigin(0.5, 0.5).
      setVisible(false)

    // points counter in upper right hand corner
    this.points_txt = this.add.text(
      this.wd2 - 100, 100 -this.hd2, '', {fontSize: 30})
    .setOrigin(1, 0)

    // white circle people move their cursor to in order to start trial
    this.origin_obj = this.add.circle(0, CURSOR_Y, ORIGIN_SIZE_RADIUS, LIGHTGRAY).setDepth(1).setVisible(true)
    this.origin = new Phaser.Geom.Circle(0, CURSOR_Y, ORIGIN_SIZE_RADIUS) // NOT AN OBJECT

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


  // reset_targets() {
  //   for (let i = 0; i < this.target_objs.length; i++) {
  //     this.target_objs[i].setFillStyle(BRIGHTRED).setStrokeStyle(0).setVisible(false)
  //   }
  //   this.origin_obj.setVisible(false)
  //   this.light_triangles.forEach(t => t.setVisible(false))
  //   this.origin_obj.setPosition(0, CURSOR_Y)
  // }

  // reset_screen() {
  //   this.reset_targets()
  //   this.reward_txt.setVisible(false)
  // }

  // show_instructions(mode, show_all=false) {
  //   this.instructions_title_group.setVisible(true)
  //   this.arrow_back.setVisible(false)
  //   this.arrow_next.setVisible(true)
  //     .setInteractive()
  //     .setAlpha(0.7)
  //     .on('pointerover', () => {
  //       this.arrow_next.setAlpha(1)
  //     }).on('pointerout', () => {
  //       this.arrow_next.setAlpha(0.7)
  //     })
  //   this.instructions_idx = 0
  //   let group;
    
  //   if (mode === 1) {
  //     group = this.instructions_group_1
  //     this.instructions_idx = 1
  //     group.getChildren()[1].setVisible(true)
  //   } else if (mode === 2) {
  //     group = this.instructions_group_2
  //   }
  //   let idx_count = group.getLength() - 1
  //   group.getChildren()[0].setVisible(true)
  //   if (show_all) {
  //     this.instructions_idx = idx_count
  //     group.setVisible(true)
  //   }
  //   this.arrow_next.on('pointerdown', () => {
  //     if (this.instructions_idx >= idx_count) {
  //       this.arrow_next.setVisible(false).removeAllListeners()
  //       this.instructions_title_group.setVisible(false)
  //       group.setVisible(false)
  //       this.trial_success_count = 0
  //       this.cur_trial_ix = -1
  //       this.next_trial()
  //       return
  //     }
  //     this.instructions_idx++;
  //     group.getChildren()[this.instructions_idx].setVisible(true)
  //   })
  // }

  update() {
    switch (this.state) {
    case states.INSTRUCT:
      
      if (this.entering) {
        this.entering = false
        console.log("Entering INSTRUCT")
        // this.reset_screen()
        // this.show_instructions(this.instruct_mode, this.instructions_shown)

        this.cur_trial_ix = 0
        
      }
      this.state = states.PRETRIAL

      break
    case states.PRETRIAL:
      if (this.entering) {
        this.entering = false
        console.log("Entering PRETRIAL")
        // this.difficulty_factor = this.current_trial.difficulty || 1
        // how long you have to be inside circle to start trial
        this.hold_val = randint(300, 600)
        // this.reset_targets()
        this.reward_txt.setVisible(false)
        this.hold_waiting = false
        this.origin_obj.setVisible(true).setFillStyle(LIGHTGRAY)
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
        this.pointer_data = {'time': [], 'x': [], 'y': [], 'cx': [], 'cy': [], 'moving': []}
        
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
          this.draw_points.push(this.add.image(p.x - this.wd2, p.y - this.hd2, 'brush').setTint(LIGHTGRAY).setScale(.5))
      };

      // time, x, y, moving
      this.pointer_data.time.push(cur_trial_time)
      this.pointer_data.x.push(pointerx)
      this.pointer_data.y.push(pointery)
      this.pointer_data.moving.push(this.moving)

      // has participant started moving yet?
      if (!this.moving) {
        let mouse_in_origin = this.origin.contains(pointerx, pointery)
        if (!mouse_in_origin) {
          console.log('moving')
          this.moving = true
          this.move_time = cur_time
          this.trial_data['move_time'] = cur_trial_time
          console.log(cur_trial_time, 'move_time')

          // if (this.instruct_mode === 1) {
          //   this.instructions_hitred.setVisible(true)
          // }
        }
      }

      // once we're moving...
      if (this.moving) {
        let drawing_time = cur_time - this.move_time

        let plen = this.pointer_data.x.length
        let p5x = this.pointer_data.x[plen - 10]
        let p5y = this.pointer_data.y[plen - 10]
        if (drawing_time > 600 && p5x == pointerx && p5y == pointery) {
          console.log('finished drawing')
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

      } else {
        // if not moving yet
        // check if we're overtime (to reach), before targets are shown
        if (drawing_time > DRAW_TIME_LIMIT) {
          console.log('TOO_SLOW_MOVE')
          this.trial_error = Err.too_slow_move
          this.move_time = -1
          this.state = states.POSTTRIAL
        }

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
        this.origin_obj.setVisible(false)

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
          let reward_txt;
          if (this.instruct_mode === 1) {
            if (this.reward === 1) {
              reward_txt = "This target is worth 1 point."
            } else {
              reward_txt = `This target is worth ${this.reward} points!`
            }
          } else  {
            if (this.reward === 1) {
              reward_txt = "You received 1 point."
            } else {
              reward_txt = `You received ${this.reward} points!`
            }
          }
          this.reward_txt.setText(reward_txt)
        } else {
          // some error happened
          if (this.instruct_mode == 1) {
            this.trial_success_count = 0
          }
          this.reward = 0
          this.selection = -1
          this.value = 0
          if (this.trial_error === Err.too_slow_move) {
            this.reward_txt.setText('Please start your movement faster.')
          } else if (this.trial_error === Err.too_slow_reach) {
            this.reward_txt.setText('Too slow!')
          } else if (this.trial_error === Err.too_far || this.trial_error === Err.returned_reach) {
            this.reset_targets()
            this.reward_txt.setText('Move your cursor toward one of the targets.')
          } else if (this.trial_error === Err.too_fast_reach) {
            this.reset_targets()
            this.reward_txt.setText('Please move the cursor slower.')
          }

          punish_delay = TRIAL_PUNISH_DELAY
          if (this.instruct_mode > 0) {
            punish_delay = PRACTICE_TRIAL_PUNISH_DELAY
          }
        }
        this.reward_txt.setVisible(true)
        if (this.instruct_mode === 0) {
          this.points_count += this.reward
          this.points_txt.setText('Points: ' + this.points_count)
        }
        

        this.trial_data['error'] = this.trial_error
        this.trial_data['reward'] = this.reward

        this.all_trial_data.push(this.trial_data)

        console.log(`reward: ${this.reward}; success count: ${this.trial_success_count}`)

        // next trial, delay based on punishment
        this.time.delayedCall(punish_delay, () => {
          this.time.delayedCall(TRIAL_DELAY, () => {
            if (this.points_count >= TASK_POINT_GOAL) {
              this.state = states.END
            } else {
              this.next_trial()
            }
          })
        })
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
