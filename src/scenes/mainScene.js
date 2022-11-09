import { randint, randchoice, shuffle } from '../utils/rand'
import { shapeSimilarity } from 'curve-matcher';
import { toPair } from '../utils/topair'
import { Enum } from '../utils/enum'

import patterns4 from '../../public/patterns/p4_filtered.json'
import patterns6 from '../../public/patterns/p6_filtered.json'
import patterns7 from '../../public/patterns/p7_filtered.json'
import patterns8 from '../../public/patterns/p8_filtered.json'

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
const PATTERN_Y = -300
const DRAWING_Y = 100
const DRAWING_SIZE = 600
const CURSOR_Y = DRAWING_Y

let DRAW_TIME_LIMIT = 2000
let TRIAL_DELAY = 1000
let TRIAL_SHAPE_DELAY = 700
let TRIAL_PUNISH_DELAY = 1000

let PHASE_LEN = 25
let MINIPHASE_LEN = 1
let TEST_LEN = 10
let BONUS_LEN_EACH = 10

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

const PATTERNS_JSON = {
  4: patterns4,
  6: patterns6,
  7: patterns7,
  8: patterns8
}

export default class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' })
    this._state = states.INSTRUCT
  }

  preload() {
    this.load.image('next', 'assets/next_instructions.png')
    this.load.image('previous', 'assets/previous_instructions.png')
    this.load.image('finish', 'assets/ticket.png')
    this.load.image('brush', 'assets/brush2.png');

    // just thumbnails for instructions screen
    let thumbnail_ids = [
      [4, 0],
      [6, 29],
      [6, 21],
      [8, 57]
    ]
    for (let i of thumbnail_ids) {
      this.load.image(`${i[0]}_${i[1]}`, `patterns/figs_${i[0]}/${i[0]}_${i[1]}-t.png`)
    }

    // the actual patterns people might be learning
    let pattern_ids = [
      [4, 41],
      [4, 40],
      [6, 13],
      [6, 5],
      [6, 72],
      [7, 65],
      [8, 18]
    ]

    for (let i of pattern_ids) {
      this.load.image(`${i[0]}_${i[1]}`, `patterns/figs_${i[0]}/${i[0]}_${i[1]}.png`)
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
    this.colorshapes = []

    // variables to start off with
    this.instruct_mode = 1
    this.pattern_ix = 0 // 0th pattern, or practice
    this.pattern_phase = 0 // 0th phase, or practice
    this.bonus_step_ix = -1 // indexes into bonus array, which adds 1 at beginning
    this.trial_ix = 0 // overall counter which resets every pattern

    
    if (user_config.condition == 1) {
      this.condition = 1
    } else if (user_config.condition == 2) {
      this.condition = 2 // 1 for single, 2 for double
    } else {
      this.condition = 3 // 3 for DT -> ST
    }

    this.is_debug = user_config.is_debug
    // this.is_debug = true
    if (this.is_debug) {
      PHASE_LEN = 1
      MINIPHASE_LEN = 1
      TEST_LEN = 1
      BONUS_LEN_EACH = 1

      this.instruct_mode = 1
      this.pattern_ix = 0

      // this.instruct_mode = 2
      // this.pattern_ix = 1

      TRIAL_DELAY = 500
      TRIAL_SHAPE_DELAY = 100
      TRIAL_PUNISH_DELAY = 100
    }

    if (user_config.start_id > 0) {
      this.pattern_ix = user_config.start_id - 1
    }

    // could be different from the patterns loaded
    this.patterns_list = [
      [4, 41],
      [4, 40],
      [6, 13],
      [6, 5],
      [6, 72],
      [7, 65],
      [8, 18]
    ]
    this.n_patterns = this.patterns_list.length - 1
    this.cur_pattern = this.patterns_list[this.pattern_ix]
    this.pattern_json = PATTERNS_JSON[this.cur_pattern[0]][this.cur_pattern[1]]

    // defining order of bonus step trials
    let trained_patterns = this.patterns_list.slice(1)
    this.bonus_trials = []
    for (let i = 0; i < BONUS_LEN_EACH; i++) {
      this.bonus_trials = this.bonus_trials.concat(shuffle(trained_patterns.slice()))
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

    this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyN = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.N);
    this.keyP = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);

    this.key1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.key2 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.key3 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
    this.key4 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR);

    var combo = this.input.keyboard.createCombo('end');
    this.input.keyboard.on('keycombomatch', event => {
        this.state = states.END
        this.input.keyboard.removeListener('keycombomatch')
    });

    // secret finish button
    this.finish = this.add.rectangle(this.wd2,this.hd2,50,50).setInteractive()
      .on('pointerdown',()=>{this.scene.start('EndScene', this.all_trial_data)})
    this.next_inst = this.add.rectangle(this.wd2,-this.hd2,50,50).setInteractive()
      .on('pointerdown',()=>{this.practice_step = 100})

    // fancy "INSTRUCTIONS" title
    this.instructions_title_group = this.add.group()
    this.instructions_title_group.add(this.add.rectangle(-345, -485, 380, 80, TEAL, 0.9))
    this.instructions_title_group.add(this.add.rectangle(-330, -470, 380, 80, ORANGE, 0.9))
    this.instructions_title_group.add(this.add.rexBBCodeText(-500, -500, '[b]Instructions[/b]', {fontFamily: 'Verdana',fontSize: 50,align: 'left',color: WHITE}))

    let instructions_font_params = {
      fontFamily: 'Verdana', 
      fontSize: 30,
      color: DARKGRAY,
      align: 'left',
    }

    // instructions page 1
    this.instructions_1 = this.add.group()
    this.instructions_1.add(this.add.rexBBCodeText(-500, -180,
      "Sample patterns:",
      instructions_font_params))
    this.instructions_1.add(this.add.image(-100, -170, '4_0').setScale(.3))
    this.instructions_1.add(this.add.image(100, -170, '6_21').setScale(.3))
    this.instructions_1.add(this.add.image(300, -170, '6_29').setScale(.3))
    this.instructions_1.add(this.add.image(500, -170, '8_57').setScale(.3))

    this.instructions_1.add(this.add.rectangle(-100, -170, 165,165, DARKGRAY).setDepth(-1))
    this.instructions_1.add(this.add.rectangle(100, -170, 165,165, DARKGRAY).setDepth(-1))
    this.instructions_1.add(this.add.rectangle(300, -170, 165,165, DARKGRAY).setDepth(-1))
    this.instructions_1.add(this.add.rectangle(500, -170, 165,165, DARKGRAY).setDepth(-1))
    
    this.instructions_1.add(this.add.rexBBCodeText(-500, 80,
      'Sample shapes:',
      instructions_font_params))
    this.instructions_1.add(this.add_colorshape(0, 0, [-150, 100]))
    this.instructions_1.add(this.add_colorshape(1, 1, [0, 100]))
    this.instructions_1.add(this.add_colorshape(2, 2, [150, 100]))
    this.instructions_1.add(this.add_colorshape(3, 3, [300, 100]))

    this.instructions_1.add(this.add.rexBBCodeText(-500, 310,
      '[b]Press "A" to continue.[/b]',
      instructions_font_params))
    this.instructions_1.setVisible(false)
    
    // instructions page 2
    this.instructions_2 = this.add.group()
    this.instructions_2.add(this.add.rexBBCodeText(-500, -300,
      '[b]You are ready to start the main experiment!\n\n\nPress "A" to begin.[/b]',
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

    // this.arrow_back.setVisible(false)
    this.rewardText.setVisible(false)
    this.warningText.setVisible(false)
    this.origin_obj.setVisible(false)

    this.remove_colorshapes()
  }

  show_instructions(mode) {
    this.hide_everything()
    this.instructions_title_group.setVisible(true)
    if (mode === 1) {
      this.instructions_1.setVisible(true)
    } else if (mode === 2) {
      this.instructions_2.setVisible(true)
    }
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
        this.pressedA = false
        console.log("Entering INSTRUCT")
        this.show_instructions(this.instruct_mode)
        
      }

      if (this.keyA.isDown && !this.pressedA) {
        this.pressedA = true
        console.log('A');
        this.instructions_title_group.setVisible(false)
        this.instructions_1.setVisible(false)
        this.instructions_2.setVisible(false)
        this.practice_step = 1
        this.trial_ix = 0
        this.next_trial()
      }

      break
    case states.PRETRIAL:
      if (this.entering) {
        this.entering = false
        this.pressedNP = false
        console.log("Entering PRETRIAL")
        this.hide_everything()
        this.pattern.setVisible(true)
        this.pattern_border.setVisible(true)
        this.origin_obj.setVisible(true).setFillStyle(LIGHTGRAY)

        var combo = this.input.keyboard.createCombo('end');
        this.input.keyboard.on('keycombomatch', event => {
            this.state = states.END
            this.input.keyboard.removeListener('keycombomatch')
        });

        if (this.instruct_mode == 1) {
          if (this.practice_step == 1) {
            this.trial_type = 'draw'
          } else if (this.practice_step == 2) {
            if (this.condition == 1) {
              this.trial_type = 'single'
            } else {
              this.trial_type = 'double'
            }
          } else if (this.practice_step == 3) {
            this.trial_type = 'draw_nofb'
          }
        } else {
          if (this.pattern_phase == 1) {
            if (this.condition == 3) {
              this.trial_type = 'double'
            } else {
              this.trial_type = 'draw'
            }
          } else if (this.pattern_phase == 3) {
            if (this.condition == 1) {
              this.trial_type = 'single'
            } else if (this.condition == 2) {
              this.trial_type = 'double'
            } else if (this.condition == 3) {
              this.trial_type = 'draw'
            }
          } else if (this.pattern_phase == 2 || this.pattern_phase == 4) {
            this.trial_type = 'draw_nofb'
          }
        }
        if (this.trial_type == 'double') {
          this.warningText.setVisible(true).setText('Pay attention to the colored shape that will appear while you draw.')
        } else if (this.trial_type == 'draw_nofb') {
          this.warningText.setVisible(true).setText('You won\'t be able to see your drawing on this trial.')
        } else if (this.trial_ix == 1) {
          this.warningText.setVisible(true).setText(`You are starting pattern #${this.pattern_ix}!`)
        }
        // how long you have to be inside circle to start trial
        this.hold_val = randint(200, 400)
        if (this.is_debug) {
          this.hold_val = 100
        }

        
        this.hold_waiting = false
        this.colorshapes = []

        this.pretrial_time = this.game.loop.now
        this.trial_data = {}
        this.trial_data['ix'] = this.trial_ix
        this.trial_data['type'] = this.trial_type
        this.trial_data['phase'] = this.pattern_phase
        this.trial_data['step'] = this.pattern_ix
        this.trial_data['pattern'] = this.cur_pattern[0] + '_' + this.cur_pattern[1]
        console.log('pattern', this.pattern_ix, 'trial', this.trial_ix, 'phase', this.pattern_phase)
        if (this.instruct_mode == 1) {
          this.trial_data['set'] = 'practice'
        } else {
          this.trial_data['set'] = 'main'
        }
        this.pointer_data = {'time': [], 'x': [], 'y': []}
        
      }

      if (this.instruct_mode == 1) {
        this.input.keyboard.on('keydown', event => {
          if (this.pressedNP) {return}
          console.log(event.key)
          if (event.key == 'n') {
            this.pressedNP = true
            this.practice_step++
            console.log('N', this.practice_step);
            this.input.keyboard.removeListener('keydown')
            this.next_trial()
          } else if (event.key == 'p') {
            this.pressedNP = true
            if (this.practice_step >= 1) {
              this.practice_step--
            }
            console.log('P', this.practice_step);
            this.input.keyboard.removeListener('keydown')
            this.next_trial()
          }
        })
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
        if (!this.moving && cur_trial_time > DRAW_TIME_LIMIT) {
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
          // calculate score
          this.pointer_data.x = this.pointer_data.x.map(x => x/1000)
          let y0 = this.pointer_data.y[0]
          // normalize y positioning and invert to enable comparisons with pattern json data
          this.pointer_data.y = this.pointer_data.y.map(y => (-y - y0)/1000)
          let user_p = toPair([this.pointer_data.x, this.pointer_data.y])
          let real_p = toPair([this.pattern_json[0], this.pattern_json[1]])

          // square real score to make people just a bit worse
          let scorert = shapeSimilarity(user_p, real_p, { estimationPoints: 100, checkRotations: false });
          this.score = Math.round(Math.pow(scorert, 2) * 1000) / 10
          this.trial_data['score'] = this.score

          console.log('score', this.score)

          if (this.trial_type != 'draw_nofb') {
            this.rewardText.setText(`Your shape score was ${this.score}.`)
          } else {
            this.rewardText.setText(`Your shape score is hidden.`)
          }

          this.time.delayedCall(TRIAL_DELAY, () => {
            for (let p of this.draw_points) {p.destroy()}
            if (this.trial_type == 'single' || this.trial_type == 'double') {
              // need to answer the shapes question first
              this.trial_data['shape_correct'] = 1
              this.state = states.SHAPES
            } else {
              // go ahead with next trial
              this.trial_data['shape_correct'] = null
              this.all_trial_data.push(this.trial_data)
              this.next_trial()
            }
          })

        } else {
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
        this.chosenShape = false
        this.hide_everything()

        if (this.trial_type != 'shapes') {
          this.trial_data['shape_correct'] = 1
        }

        if (this.trial_type == 'double') {
          // double tasking question about missing item
          this.shapeQuestion.setText('Which shape did you see? [1, 2, 3, 4]:').setVisible(true)
        } else {
          // otherwise any old color or shape will do
          this.shapeAnswer = randchoice([0,1,2,3])
          this.cs_ids = this.choose_cs_subset()
          let csid = this.get_csid(this.cs_ids[0], this.cs_ids[1], this.shapeAnswer)
          let dColor = ['blue', 'orange', 'purple', 'green'][csid[0]]
          let dShape = ['square', 'circle', 'triangle', 'diamond'][csid[1]]
          this.shapeQuestion.setText(`In which position is the ${dColor} ${dShape}? [1, 2, 3, 4]:`).setVisible(true)
        }
        console.log(this.shapeAnswer)
        this.show_colorshapes(this.cs_ids[0], this.cs_ids[1])

      }

      this.input.keyboard.on('keydown', event => {
        if (this.chosenShape) {return}
        this.chosenShape = true
        console.log(event.key)
        this.input.keyboard.removeListener('keydown')
        if (event.key == this.shapeAnswer + 1) {
          this.shapeResponse.setText('Correct!').setStyle({color: BRIGHTGREEN}).setVisible(true)
          this.remove_colorshapes()
          
          // if this isn't just a miniphase, then finish adding the trial data
          if (this.trial_type != 'shapes') {
            this.all_trial_data.push(this.trial_data)
          }

          this.time.delayedCall(TRIAL_SHAPE_DELAY, () => {
            this.next_trial()
          })
        } else {
          this.shapeResponse.setText('Incorrect - let\'s try again.').setStyle({color: BRIGHTRED}).setVisible(true)
          this.remove_colorshapes()

          this.time.delayedCall(TRIAL_PUNISH_DELAY, () => {
            // if this isn't just a miniphase then question was answered WRONG at least once
            if (this.trial_type != 'shapes') {
              this.trial_data['shape_correct'] = 0
            }
            this.state = states.SHAPES
          })
        }

      });

      break
    case states.END:
      if (this.entering) {
        console.log("Entering END")
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
    console.log('next_trial')
    if (this.instruct_mode == 1) {
      // move on from the practice rounds
      if (this.practice_step > 3) {
        this.instruct_mode = 2
        this.state = states.INSTRUCT
        this.pattern_ix++
        return
      }
      this.state = states.PRETRIAL
    } else {
      this.trial_ix++

      if (this.pattern_ix <= this.n_patterns) {
        console.log(this.pattern_ix, this.n_patterns)
        if (this.trial_ix <= PHASE_LEN) {
          // do nothing, you are in phase 1
          this.pattern_phase = 1
          this.state = states.PRETRIAL
        } else if (this.trial_ix <= PHASE_LEN + MINIPHASE_LEN) {
          // between phase 1 and 2
          this.trial_type = 'shapes'
          this.state = states.SHAPES
        } else if (this.trial_ix <= PHASE_LEN + MINIPHASE_LEN + TEST_LEN) {
          // phase 2, the first test phase
          this.pattern_phase = 2
          this.state = states.PRETRIAL
        } else if (this.trial_ix <= PHASE_LEN + MINIPHASE_LEN * 2 + TEST_LEN) {
          // between phase 2 and 3
          this.trial_type = 'shapes'
          this.state = states.SHAPES
        } else if (this.trial_ix <= PHASE_LEN * 2 + MINIPHASE_LEN * 2 + TEST_LEN) {
          // phase 3, where questions about shapes are asked
          this.pattern_phase = 3
          this.state = states.PRETRIAL
        } else if (this.trial_ix <= PHASE_LEN * 2 + MINIPHASE_LEN * 3 + TEST_LEN) {
          // gap between p2 and p3, do some shape trials
          this.trial_type = 'shapes'
          this.state = states.SHAPES
        } else if (this.trial_ix <= PHASE_LEN * 2 + MINIPHASE_LEN * 3 + TEST_LEN * 2) {
          // phase 3, test phase
          this.pattern_phase = 4
          this.state = states.PRETRIAL
        } else {
          // finished p4, move on to next shape
          this.pattern_ix++
          if (this.pattern_ix <= this.n_patterns) {
            this.state = states.PRETRIAL
          } else {
            // going into bonus step
          }
          this.trial_ix = 1
        }

        // we are in new step! destroy old pattern and replace with new one
        if (this.trial_ix == 1 && this.pattern_ix <= this.n_patterns) {
          this.cur_pattern = this.patterns_list[this.pattern_ix]
          this.pattern.setTexture(this.cur_pattern[0] + '_' + this.cur_pattern[1]).setVisible(false)
          this.pattern_json = PATTERNS_JSON[this.cur_pattern[0]][this.cur_pattern[1]]
          this.pattern_phase = 1
        }
      }

      // this.pattern_ix == 5 so this is bonus step
      // not a for loop because previous if statement can take us here
      if (this.pattern_ix == this.n_patterns + 1) {
        this.pattern_phase = 4
        //choose random step and show that in phase 3
        if (this.trial_ix <= MINIPHASE_LEN) {
          // gap between p3 and bonus step
          this.trial_type = 'shapes'
          this.state = states.SHAPES
        } else if (this.trial_ix <= this.bonus_trials.length + MINIPHASE_LEN) {
          this.bonus_step_ix++
          this.cur_pattern = this.bonus_trials[this.bonus_step_ix]
          this.pattern.setTexture(this.cur_pattern[0] + '_' + this.cur_pattern[1]).setVisible(false)
          this.pattern_json = PATTERNS_JSON[this.cur_pattern[0]][this.cur_pattern[1]]
          this.state = states.PRETRIAL
        } else {
          // time to end
          this.state = states.END
        }
      }
    }
  }
}
