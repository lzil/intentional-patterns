import { randint, randchoice, shuffle } from '../utils/rand'
import toPairs from '../utils/topairs'
import { shapeSimilarity } from 'curve-matcher';
import { Enum } from '../utils/enum'

import patterns4 from '../../public/patterns/p4.json'
import patterns6 from '../../public/patterns/p6.json'
import patterns7 from '../../public/patterns/p7.json'
// import patterns8 from '../../public/patterns/p8.json'

const WHITE = 0xffffff
const BLACK = 0x000000
const DARKGRAY = 0x333333
const LIGHTGRAY = 0x999999

// instructions, and point beginning/ending
const TEAL = 0x7DC0A6
const ORANGE = 0xED936B

// correct/incorrect labels
const BRIGHTRED = 0xd40a0a
const BRIGHTGREEN = 0x24f49a

const ORIGIN_SIZE_RADIUS = 15
const MOVE_TIME_LIMIT = 1200
const DRAW_TIME_LIMIT = 3000

const PATTERN_Y = -300
const DRAWING_Y = 200
const DRAWING_SIZE = 600
const CURSOR_Y = DRAWING_Y

let TRIAL_DELAY = 1500
let TRIAL_SHAPE_DELAY = 1000
let TRIAL_PUNISH_DELAY = 2000

const states = Enum([
  'INSTRUCT', // show text instructions (based on stage of task)
  'PRETRIAL', // wait until ready to start trial
  'MOVING', // the movement part
  'POSTTRIAL', // auto teleport back to restore point
  'STATES',
  'END' //
])

const Err = {
  none: 0,
  too_slow_move: 2,
}

const DCols = {
  0: 0x22a4e0,
  1: 0xe05e22,
  2: 0xbd22e0,
  3: 0x3cc81c
}

const Patterns = {
  4: patterns4,
  6: patterns6,
  7: patterns7
}

export default class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' })
    this._state = states.INSTRUCT
  }

  preload() {
    this.load.image('next', 'assets/next_instructions.png')
    // this.load.image('next_debug', 'assets/next_debug.png')
    this.load.image('previous', 'assets/previous_instructions.png')
    this.load.image('finish', 'assets/ticket.png')
    this.load.image('brush', 'assets/brush2.png');


    // all the images of ids
    this.p4_ids = [0, 40, 41]
    this.p6_ids = [13, 72]
    this.p7_ids = [65]

    for (let i of this.p4_ids) {
      this.load.image(`4_${i}`, `patterns/figs_4/4_${i}.png`);
    }
    for (let i of this.p6_ids) {
      this.load.image(`6_${i}`, `patterns/figs_6/6_${i}.png`);
    }
    for (let i of this.p7_ids) {
      this.load.image(`7_${i}`, `patterns/figs_7/7_${i}.png`);
    }
  }

  create() {
    let config = this.game.config
    let user_config = this.game.user_config

    this.hd2 = config.height/2
    this.wd2 = config.width/2
    this.cameras.main.setBounds(-this.wd2, -this.hd2, this.wd2*2, this.hd2*2)
    
    this.state = states.INSTRUCT
    this.entering = true
    this.all_trial_data = []

    // variables to start off with
    this.instruct_mode = 1
    this.task_phase = 0

    this.colorshapes = []

    this.phase_len = 20
    this.miniphase_len = 3
    this.test_len = 10
    if (user_config.condition == 1) {
      this.condition = 1
    } else if (user_config.condition == 2) {
      this.condition = 2 // 1 for single, 2 for double
    } else {
      this.condition = 3 // 3 for DT -> ST
    }

    // the patterns used in this experiment
    this.task_step = 0
    this.patterns_list = [
      [4, 41],
      [4, 40],
      [6, 13],
      [6, 72],
      [7, 65]
    ]
    this.n_patterns = this.patterns_list.length - 1
    this.cur_pattern = this.patterns_list[this.task_step]
    this.pattern_json = Patterns[this.cur_pattern[0]]
    this.bonus_trials_each = 7

    this.is_debug = user_config.is_debug
    if (this.is_debug) {
      this.phase_len = 1
      this.miniphase_len = 1
      this.test_len = 1
      this.instruct_mode = 2
      this.task_step = 1
      this.bonus_trials_each = 1

      TRIAL_DELAY = 500
      TRIAL_SHAPE_DELAY = 100
      TRIAL_PUNISH_DELAY = 100
    }

    console.log('debug', this.is_debug)
    console.log('condition', this.condition)

    // drawing elements
    this.pattern_border = this.add.rectangle(0, PATTERN_Y, 280, 280, DARKGRAY)
    console.log(this.cur_pattern[0] + '_' + this.cur_pattern[1])
    this.pattern = this.add.image(0, PATTERN_Y, this.cur_pattern[0] + '_' + this.cur_pattern[1]).setScale(.5)

    // text with score
    this.rewardText = this.add.text(0, -100, '', {fontFamily: 'Verdana', fontSize: 50, color: DARKGRAY, align: 'center' }).
      setOrigin(0.5, 0.5)

    // warning text
    this.warningText = this.add.text(0, -500, '', {fontFamily: 'Verdana', fontSize: 50, color: DARKGRAY, align: 'center' }).
      setOrigin(0.5, 0.5)

    // shape question elements
    this.shapeQuestion = this.add.text(0, -120, '', {fontFamily: 'Verdana', fontSize: 50, color: DARKGRAY, align: 'center'})
      .setOrigin(.5,.5)
    this.shapeResponse = this.add.rexBBCodeText(0, 120, '', {fontFamily: 'Verdana', fontSize: 50, color: DARKGRAY, align: 'center'})
      .setOrigin(.5,.5)

    // circle people move their cursor to in order to start trial
    this.origin_obj = this.add.circle(0, CURSOR_Y, ORIGIN_SIZE_RADIUS, LIGHTGRAY).setDepth(1).setVisible(true)
    this.origin = new Phaser.Geom.Circle(0, CURSOR_Y, ORIGIN_SIZE_RADIUS) // NOT AN OBJECT

    // next and back buttons
    this.arrow_next = this.add.image(600, 450, 'next').setScale(.2).setAlpha(.7)
    this.arrow_back = this.add.image(-600, 450, 'previous').setScale(.2).setAlpha(.7)
      .setInteractive().setVisible(false)
      .on('pointerover', () => {this.arrow_back.setAlpha(1)})
      .on('pointerout', () => {this.arrow_back.setAlpha(0.7)})
      .on('pointerdown', () => {
        this.state = states.INSTRUCT
        this.instruct_mode = 1
        this.arrow_back.setVisible(false)
        this.origin_obj.setVisible(false)
        this.trial_success_count = 0
      })

    // secret finish button
    this.finish = this.add.rectangle(this.wd2,this.hd2,50,50).setInteractive()
      .on('pointerdown',()=>{this.scene.start('EndScene', this.all_trial_data)})
    this.next_inst = this.add.rectangle(this.wd2,-this.hd2,50,50).setInteractive()
      .on('pointerdown',()=>{this.trial_success_count = 100})

    // fancy "INSTRUCTIONS" title
    this.instructions_title_group = this.add.group()
    this.instructions_title_group.add(this.add.rectangle(-315, -485, 425, 80, TEAL, 0.9))
    this.instructions_title_group.add(this.add.rectangle(-300, -470, 425, 80, ORANGE, 0.9))
    this.instructions_title_group.add(this.add.rexBBCodeText(-500, -500, 'INSTRUCTIONS', {fontFamily: 'Verdana',fontSize: 50,align: 'left',color: WHITE}))

    let instructions_font_params = {
      fontFamily: 'Verdana', 
      fontSize: 30,
      color: DARKGRAY,
      align: 'left'
    }

    // instructions page 1
    this.instructions_1 = this.add.group()
    this.instructions_1.add(this.add.rexBBCodeText(-500, -380,
      `[b]In this game[/b], you'll draw patterns going from [color=#7DC0A6][b]teal[/b][/color] to [color=#ED936B][b]orange[/b][/color].`,
      instructions_font_params))
    this.instructions_1.add(this.add.rexBBCodeText(-500, -250,
      "Here's an example of a pattern:",
      instructions_font_params))
    this.instructions_1.add(this.add.image(100, -240, '4_0').setScale(.3))
    this.instructions_1.add(this.add.rectangle(100, -240, 170,170, DARKGRAY).setDepth(-1))
    this.instructions_1.add(this.add.rexBBCodeText(-500, -140,
      'Start a trial by moving your mouse to the [color=#999999][b]gray[/b][/color] circle. The [color=#999999][b]gray[/b][/color] circle\nwill turn [b][color=#7DC0A6]teal[/color][/b], and the pattern will appear.',
      instructions_font_params))
    this.instructions_1.add(this.add.rexBBCodeText(-500, -40,
      'Now try to draw the pattern. [b]Size does not matter.[/b] Once you finish,\nor time runs out, you\'ll see your score. Better drawing = higher score!',
      instructions_font_params))
    this.instructions_1.add(this.add.rectangle(-450, 60, 100, 8, DARKGRAY))
    this.instructions_1.add(this.add.rexBBCodeText(-500, 80,
      'On some trials, shapes like these will pop up while you draw:',
      instructions_font_params))
    this.instructions_1.add(this.add_colorshape(0, 0, [-450, 160]))
    this.instructions_1.add(this.add_colorshape(1, 1, [-300, 160]))
    this.instructions_1.add(this.add_colorshape(2, 2, [-150, 160]))
    this.instructions_1.add(this.add_colorshape(3, 3, [0, 160]))
    this.instructions_1.add(this.add.rexBBCodeText(-500, 210,
      '[b]Remember them![/b] You\'ll be asked about them afterwards.',
      instructions_font_params))
    this.instructions_1.add(this.add.rectangle(-450, 280, 100, 8, DARKGRAY))
    this.instructions_1.add(this.add.rexBBCodeText(-500, 310,
      'On other trials, you won\'t be able to see your cursor, or even your score.',
      instructions_font_params))
    this.instructions_1.add(this.add.rexBBCodeText(-500, 390,
      'Let\'s start with some practice rounds.',
      instructions_font_params))
    this.instructions_1.setVisible(false)
    
    // instructions page 2
    this.instructions_2 = this.add.group()
    this.instructions_2.add(this.add.rexBBCodeText(-500, -300,
      '[b]Good job![/b]',
      instructions_font_params))
    this.instructions_2.add(this.add.rexBBCodeText(-500, -200,
      `In the experiment, you'll see the same pattern in blocks of about ${this.phase_len * 2 + this.test_len} trials.\nTry to score well on each pattern. The experiment ends after [b]4 patterns[/b]\nand a [b]bonus round[/b] with all the patterns.`,
      instructions_font_params))
    this.instructions_2.add(this.add.rexBBCodeText(-500, -50,
      `Trials may be interspersed with questions about colored shapes, as you\nsaw in the practice rounds.`,
      instructions_font_params))
    this.instructions_2.add(this.add.rexBBCodeText(-500, 100,
      '[b]Click the arrow begin the experiment.[/b]',
      instructions_font_params))
    this.instructions_2.setVisible(false)

  } // end create

  remove_colorshapes() {
    this.colorshapes.forEach(p => p.destroy())
    this.colorshapes = []
  }

  hide_everything() {
    this.pattern.setVisible(false)
    this.pattern_border.setVisible(false)

    this.shapeQuestion.setVisible(false)
    this.shapeResponse.setVisible(false)

    this.arrow_back.setVisible(false)
    this.rewardText.setVisible(false)
    this.warningText.setVisible(false)
    this.origin_obj.setVisible(false)

    this.remove_colorshapes()
  }

  show_instructions(mode) {
    this.hide_everything()
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
      group = this.instructions_1
    } else if (mode === 2) {
      group = this.instructions_2
    }
    group.setVisible(true)
    this.arrow_next.on('pointerdown', () => {
      this.arrow_next.setVisible(false).removeAllListeners()
      this.instructions_title_group.setVisible(false)
      group.setVisible(false)
      this.trial_success_count = 0
      this.cur_trial_ix = 0
      this.next_trial()
    })
  }
  

  // randomly choose 2 of 3 colors, 2 of 3 shapes
  choose_cs_subset() {
    let choices = [0,1,2,3]
    let colors = shuffle(choices).slice(1)
    let shapes = shuffle(choices).slice(1)
    return [colors, shapes]
  }

  // get color, shape ids from i in [0,1,2,3]
  get_csid(colors, shapes, i) {
    let colorid, shapeid;
    if (i == 0) {
      colorid = colors[0]
      shapeid = shapes[0]
    } else if (i == 1) {
      colorid = colors[0]
      shapeid = shapes[1]
    } else if (i == 2) {
      colorid = colors[1]
      shapeid = shapes[0]
    } else if (i == 3) {
      colorid = colors[1]
      shapeid = shapes[1]
    }
    return [colorid, shapeid]
  }

  add_colorshape(colorid, shapeid, pos) {
    let shape;
    let color = DCols[colorid]
    if (shapeid == 0) {
      shape = this.add.rectangle(pos[0], pos[1], 50, 50, color, 0).setStrokeStyle(10, color)
    } else if (shapeid == 1) {
      shape = this.add.circle(pos[0], pos[1], 25, color, 0).setStrokeStyle(10, color)
    } else if (shapeid == 2) {
      shape = this.add.triangle(pos[0], pos[1], 27, 0, 0, 27 * Math.sqrt(3), 27 * 2, 27 * Math.sqrt(3)).setStrokeStyle(10, color)
    } else if (shapeid == 3) {
      shape = this.add.star(pos[0], pos[1], 4, 29 / Math.sqrt(2), 29, color, 0).setStrokeStyle(10, color)
    }
    return shape
  }

  // show distractor during "double" trials
  show_distractor(colors, shapes) {
    let positions = shuffle([
      [-400, 0], [400, 0],
      [-400, 200], [400, 200],
      [-420, -100], [420, -100],
      [-450, 300], [450, 300],
      [-500, 100], [500, 100],
      [-450, 0], [450, 0],
      [-500, -50], [500, -50],
      ])
    let chosenId = randchoice([0,1,2,3])

    let csid = this.get_csid(colors, shapes, chosenId)
    let color = csid[0]
    let shapeid = csid[1]
    this.colorshapes.push(this.add_colorshape(color, shapeid, positions[0]))

    return chosenId
  }

  // show colorshapes during "shape" trials
  show_colorshapes(colors, shapes) {
    let positions = [[-200, 0], [-66, 0], [66, 0], [200, 0]]
    for (let i = 0; i < 4; i++) {
      let pos = positions[i]
      let csid = this.get_csid(colors, shapes, i)
      let color = csid[0]
      let shapeid = csid[1]
      this.colorshapes.push(this.add_colorshape(color, shapeid, pos))
    }

  }

  update() {
    switch (this.state) {
    case states.INSTRUCT:
      
      if (this.entering) {
        this.entering = false
        console.log("Entering INSTRUCT")
        this.show_instructions(this.instruct_mode)
        
      }

      break
    case states.PRETRIAL:
      if (this.entering) {
        this.entering = false
        console.log("Entering PRETRIAL")
        this.hide_everything()
        this.pattern.setVisible(true)
        this.pattern_border.setVisible(true)
        this.origin_obj.setVisible(true).setFillStyle(LIGHTGRAY)

        if (this.instruct_mode == 1) {
          this.arrow_back.setVisible(true)
          if (this.trial_success_count < 2) {
            this.trial_type = 'draw'
          } else if (this.trial_success_count < 4) {
            this.trial_type = 'single'
          } else if (this.trial_success_count < 6) {
            this.trial_type = 'double'
          } else {
            this.trial_type = 'draw_nofb'
          }
        } else {
          if (this.task_phase == 1) {
            if (this.condition == 3) {
              this.trial_type = 'double'
            } else {
              this.trial_type = 'draw'
            }
          } else if (this.task_phase == 2) {
            if (this.condition == 1 || this.condition == 3) {
              this.trial_type = 'single'
            } else if (this.condition == 2) {
              this.trial_type = 'double'
            }
          } else if (this.task_phase == 3) {
            this.trial_type = 'draw_nofb'
          }
        }
        if (this.trial_type == 'double') {
          this.warningText.setVisible(true).setText('Pay attention to the colored shape that will appear while you draw.')
        } else if (this.trial_type == 'draw_nofb') {
          this.warningText.setVisible(true).setText('You won\'t be able to see your drawing on this trial.')
        } else if (this.cur_trial_ix == 1) {
          this.warningText.setVisible(true).setText(`You are starting pattern #${this.task_step}!`)
        }
        // how long you have to be inside circle to start trial
        this.hold_val = randint(300, 600)
        if (this.is_debug) {
          this.hold_val = 100
        }

        
        this.hold_waiting = false
        
        this.colorshapes = []

        this.pretrial_time = this.game.loop.now
        this.trial_data = {}
        this.trial_data['ix'] = this.cur_trial_ix
        this.trial_data['type'] = this.trial_type
        this.trial_data['phase'] = this.task_phase
        this.trial_data['step'] = this.task_step
        this.trial_data['pattern'] = this.cur_pattern[0] + '_' + this.cur_pattern[1]
        console.log('trial', this.cur_trial_ix)
        console.log('phase', this.task_phase)
        if (this.instruct_mode == 1) {
          this.trial_data['set'] = 'practice'
        } else {
          this.trial_data['set'] = 'main'
        }
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
        if (this.instruct_mode == 1) {this.arrow_back.setVisible(false)}

        this.origin_obj.setFillStyle(TEAL)

        this.pattern.setVisible(true)
        this.pattern_border.setVisible(true)

        // start time is when the circle turns green
        // start time != target show time. record all timestamps anyway, relative to start time
        this.start_time = this.game.loop.now
        this.trial_data['start_time_abs'] = this.start_time
        this.trial_data['pretrial_time'] = this.pretrial_time - this.start_time

        this.draw_points = []
        this.game.canvas.style.cursor = 'none' 
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
        let pt = this.add.image(px, py, 'brush').setTint(LIGHTGRAY).setScale(.5).setAlpha(.5).setDepth(-2)
        if (this.trial_type == 'draw_nofb' ) {pt.setVisible(false)}
        this.draw_points.push(pt)
      };

      // has participant started moving yet?
      if (!this.moving) {
        let mouse_in_origin = this.origin.contains(pointerx, pointery)

        // participant just moved!
        if (!mouse_in_origin) {
          this.moving = true
          this.move_time = cur_time
          this.trial_data['move_time'] = cur_trial_time
          // console.log(cur_trial_time, 'move_time')

          this.pattern.setVisible(false)
          this.pattern_border.setVisible(false)

          // we will need to ask a question about colored shapes
          this.cs_ids = this.choose_cs_subset()
          if (this.trial_type == 'double') {
            this.shapeAnswer = this.show_distractor(this.cs_ids[0], this.cs_ids[1])
          } else if (this.trial_type == 'single') {
            this.shapeAnswer = randchoice([0,1,2,3])
          }
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
        let p10x = this.pointer_data.x[plen - 10]
        let p10y = this.pointer_data.y[plen - 10]
        if (drawing_time > 600 && p10x == pointerx && p10y == pointery) {
          // console.log('STOPPED_MOVEMENT')
          this.trial_error = Err.none
          this.state = states.POSTTRIAL
        }

        // reached drawing limit time. not an error
        if (drawing_time > DRAW_TIME_LIMIT) {
          console.log('DRAW_TIME_LIMIT')
          this.trial_error = Err.none
          this.state = states.POSTTRIAL
        }
      }

      this.prev_time = cur_time

      break

    case states.POSTTRIAL:
      if (this.entering) {
        console.log("Entering POSTTRIAL")
        this.entering = false

        this.game.canvas.style.cursor = 'default' 
        this.hide_everything()

        this.end_time = this.game.loop.now
        this.trial_data['end_time'] = this.end_time - this.start_time
        this.trial_data['trial_time'] = this.end_time - this.move_time
        this.trial_data['pointer_data'] = this.pointer_data

        this.trial_data['error'] = this.trial_error
        this.trial_data['score'] = 0 // 0 by default

        if (this.trial_error === Err.none) {
          // no error happened
          // calculate score
          let y0 = this.pointer_data.y[0]
          // normalize y positioning and invert to enable comparisons with pattern json data
          this.pointer_data.y = this.pointer_data.y.map(y => (-y - y0))
          let user_p = [this.pointer_data.x, this.pointer_data.y]
          let real_p = [this.pattern_json[this.cur_pattern[1]][0], this.pattern_json[this.cur_pattern[1]][1]]
          let pairs = toPairs(user_p, real_p)
          let score = shapeSimilarity(pairs[0], pairs[1], { estimationPoints: 100, checkRotations: false });
          this.score = Math.pow(score, 3)
          console.log('score', this.score)

          if (this.instruct_mode == 1) {this.arrow_back.setVisible(false)}

          this.score = Math.round(this.score * 1000) / 10
          if (this.trial_type != 'draw_nofb') {
            this.rewardText.setText(`Your shape score was ${this.score}.`)
          } else {
            this.rewardText.setText(`Your shape score is hidden.`)
          }

          this.trial_data['score'] = this.score
          
          this.time.delayedCall(TRIAL_DELAY, () => {
            for (let p of this.draw_points) {p.destroy()}
            if (this.trial_type == 'single' || this.trial_type == 'double') {
              // need to answer the shapes question first
              this.state = states.SHAPES
            } else {
              // go ahead with next trial
              this.trial_data['shape_correct'] = 1
              this.trial_success_count++
              this.all_trial_data.push(this.trial_data)
              this.next_trial()
            }
          })
        } else {
          // the only error in this task is moving too slow
          if (this.instruct_mode == 1) {
            this.trial_success_count = Math.max(this.trial_success_count - 2, 0)
          }
          this.rewardText.setText('Please start your movement faster.')
          this.all_trial_data.push(this.trial_data)
          this.time.delayedCall(TRIAL_PUNISH_DELAY, () => {
            for (let p of this.draw_points) {p.destroy()}
            this.next_trial()
          })
        }
        this.rewardText.setVisible(true)
      }
      break
    case states.SHAPES:
      if (this.entering) {
        this.entering = false
        this.hide_everything()

        if (this.instruct_mode == 1) {this.arrow_back.setVisible(true)}

        if (this.trial_type != 'shapes') {
          this.trial_data['shape_correct'] = 1
        }

        if (this.trial_type == 'double') {
          // double tasking question about missing item
          this.shapeQuestion.setText('Please click the shape that appeared while you were drawing:').setVisible(true)
        } else {
          // otherwise any old color or shape will do
          this.shapeAnswer = randchoice([0,1,2,3])
          this.cs_ids = this.choose_cs_subset()
          let csid = this.get_csid(this.cs_ids[0], this.cs_ids[1], this.shapeAnswer)
          let dColor = ['blue', 'orange', 'purple', 'green'][csid[0]]
          let dShape = ['square', 'circle', 'triangle', 'diamond'][csid[1]]
          this.shapeQuestion.setText(`Please click the ${dColor} ${dShape}:`).setVisible(true)
        }
        console.log(this.shapeAnswer)
        this.show_colorshapes(this.cs_ids[0], this.cs_ids[1])

        for (let i = 0; i < 4; i++) {
          this.colorshapes[i].setInteractive()
          if (i == this.shapeAnswer) {
            this.colorshapes[i].once('pointerdown', () => {
              this.shapeResponse.setText('Correct!').setStyle({color: BRIGHTGREEN}).setVisible(true)
              this.trial_success_count++
              this.remove_colorshapes()
              if (this.instruct_mode == 1) {this.arrow_back.setVisible(false)}
              
              // if this isn't just a miniphase, then finish adding the trial data
              if (this.trial_type != 'shapes') {
                this.all_trial_data.push(this.trial_data)
              }

              this.time.delayedCall(TRIAL_SHAPE_DELAY, () => {
                if (this.instruct_mode == 1) {this.arrow_back.setVisible(true)}
                this.next_trial()
              })
            })
          } else {
            this.colorshapes[i].once('pointerdown', () => {
              this.shapeResponse.setText('Incorrect - let\'s try again.').setStyle({color: BRIGHTRED}).setVisible(true)
              this.remove_colorshapes()
              if (this.instruct_mode == 1) {
                this.arrow_back.setVisible(false)
                this.trial_success_count = 3
              }
              
              this.time.delayedCall(TRIAL_PUNISH_DELAY, () => {
                if (this.instruct_mode == 1) {this.arrow_back.setVisible(true)}

                // if this isn't just a miniphase then question was answered WRONG at least once
                if (this.trial_type != 'shapes') {
                  this.trial_data['shape_correct'] = 0
                }
                this.state = states.SHAPES
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
    if (this.instruct_mode == 1) {
      // move on from the practice rounds
      if (this.trial_success_count >= 8) {
        this.instruct_mode = 2
        this.state = states.INSTRUCT
        this.task_step++
        return
      }
      this.state = states.PRETRIAL
    } else {
      this.cur_trial_ix++

      if (this.task_step <= this.n_patterns) {
        if (this.cur_trial_ix <= this.phase_len) {
          // do nothing, you are in phase 1
          this.task_phase = 1
          this.state = states.PRETRIAL
        } else if (this.cur_trial_ix <= this.phase_len + this.miniphase_len) {
          // gap between p1 and p2, do some shape trials
          this.trial_type = 'shapes'
          this.state = states.SHAPES
        } else if (this.cur_trial_ix <= this.phase_len * 2 + this.miniphase_len) {
          // phase 2, where questions about shapes are asked
          this.task_phase = 2
          this.state = states.PRETRIAL
        } else if (this.cur_trial_ix <= this.phase_len * 2 + this.miniphase_len * 2) {
          // gap between p2 and p3, do some shape trials
          this.trial_type = 'shapes'
          this.state = states.SHAPES
        } else if (this.cur_trial_ix <= this.phase_len * 2 + this.miniphase_len * 2 + this.test_len) {
          // phase 3, test phase
          this.task_phase = 3
          this.state = states.PRETRIAL
        } else {
          // finished p3, move on to next shape
          this.task_step++
          if (this.task_step <= this.n_patterns) {
            this.state = states.PRETRIAL
          } else {
            // going into bonus step
            this.bonus_step_ix = -1
            // defining order of bonus step trials
            let trained_patterns = this.patterns_list.slice(1)
            this.bonus_trials = []
            for (let i = 0; i < this.bonus_trials_each; i++) {
              this.bonus_trials = this.bonus_trials.concat(shuffle(trained_patterns.slice()))
            }
          }
          this.cur_trial_ix = 1
        }

        // we are in new step! destroy old pattern and replace with new one
        if (this.cur_trial_ix == 1 && this.task_step <= this.n_patterns) {
          this.pattern.destroy()
          this.cur_pattern = this.patterns_list[this.task_step]
          this.pattern = this.add.image(0, PATTERN_Y, this.cur_pattern[0] + '_' + this.cur_pattern[1])
            .setScale(.5)
            .setVisible(false)
          this.pattern_json = Patterns[this.cur_pattern[0]]
          this.task_phase = 1
        }
      } 

      // this.task_step == 5 so this is bonus step
      // not a for loop because previous if statement can take us here
      if (this.task_step == this.n_patterns + 1) {
        this.task_phase = 3
        //choose random step and show that in phase 3
        if (this.cur_trial_ix <= this.miniphase_len) {
          // gap between p3 and bonus step
          this.trial_type = 'shapes'
          this.state = states.SHAPES
        } else if (this.cur_trial_ix <= this.bonus_trials.length + this.miniphase_len) {
          this.pattern.destroy()
          this.bonus_step_ix++
          this.cur_pattern = this.bonus_trials[this.bonus_step_ix]
          this.pattern = this.add.image(0, PATTERN_Y, this.cur_pattern[0] + '_' + this.cur_pattern[1])
            .setScale(.5)
            .setVisible(false)
          this.pattern_json = Patterns[this.cur_pattern[0]]
          this.state = states.PRETRIAL
        } else {
          // time to end
          this.state = states.END
        }
      }
    }
  }
}
