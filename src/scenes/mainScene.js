import { TypingText } from '../objects/typingtext'
import { Enum } from '../utils/enum'
import { clamp } from '../utils/clamp'
import { randint, randchoice, shuffle } from '../utils/rand'
import toPairs from '../utils/topairs'

import { shapeSimilarity } from 'curve-matcher';

import patterns4 from '../../public/patterns/p4.json'
import patterns6 from '../../public/patterns/p6.json'
import patterns7 from '../../public/patterns/p7.json'
// import patterns8 from '../../public/patterns/p8.json'

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

const TRIAL_DELAY = 1500
const TRIAL_SHAPE_DELAY = 1000
const TRIAL_PUNISH_DELAY = 3000

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

const D_BLUE = 0x22a4e0
const D_ORANGE = 0xe05e22
const D_PURPLE = 0xbd22e0
const DCols = {
  0: D_BLUE,
  1: D_ORANGE,
  2: D_PURPLE
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
    this.p6_ids = [13, 25, 70, 72, 90, 96]
    this.p7_ids = [32, 65, 92]
    // this.p8_ids = [1, 21, 57, 60, 81]

    for (let i of this.p4_ids) {
      this.load.image(`4_${i}`, `patterns/figs_4/4_${i}.png`);
    }
    for (let i of this.p6_ids) {
      this.load.image(`6_${i}`, `patterns/figs_6/6_${i}.png`);
    }
    for (let i of this.p7_ids) {
      this.load.image(`7_${i}`, `patterns/figs_7/7_${i}.png`);
    }
    // for (let i of this.p8_ids) {
    //   this.load.image(`8_${i}`, `patterns/figs_8/8_${i}.png`);
    // }
  }

  create() {
    // this.scale.startFullscreen()
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
    this.instruct_mode = 1
    this.task_step = 1
    this.task_phase = 0
    this.difficulty = '4'
    this.pattern_id = '41'
    this.pattern_json = patterns4

    this.colorshapes = []
    this.distractors = []

    this.phase_len = 20
    this.miniphase_len = 3
    this.test_len = 10
    if (user_config.condition == 1) {
      this.subject_type = 1
    } else {
      this.subject_type = 2 // 1 for single, 2 for double
    }
    

    this.is_debug = user_config.is_debug
    if (this.is_debug) {
      this.subject_type = 2
    }


    // drawing elements
    this.pattern_border = this.add.rectangle(0, PATTERN_Y, 280, 280, DARKGRAY)
    this.pattern = this.add.image(0, PATTERN_Y, '4_41').setScale(.5)

    // text with score
    this.rewardText = this.add.text(0, -100, '', {fontFamily: 'Verdana', fontSize: 50, color: DARKGRAY, align: 'center' }).
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
      .on('pointerdown',()=>{this.trial_success_count = 5})

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
    this.instructions_1.add(this.add.rexBBCodeText(-500, -130,
      'Start a trial by moving your mouse to the [color=#999999][b]gray[/b][/color] circle. The [color=#999999][b]gray[/b][/color] circle\nwill turn [b][color=#7DC0A6]teal[/color][/b], the pattern will appear, and your mouse will disappear.\nNow try to draw the pattern.',
      instructions_font_params))
    this.instructions_1.add(this.add.rexBBCodeText(-500, -20,
      '[b]You won\'t be able to see your drawing. Size does not matter.[/b]',
      instructions_font_params))
    
    this.instructions_1.add(this.add.rexBBCodeText(-500, 50,
      'Once you finish, or time runs out, you\'ll see your drawing and your\nscore. The better your drawing, the higher your score.',
      instructions_font_params))
    this.instructions_1.add(this.add.rectangle(-450, 150, 100, 8, DARKGRAY))
    this.instructions_1.add(this.add.rexBBCodeText(-500, 180,
      'If you see shapes like these pop up while you draw, [b]remember them![/b]\n\n\n\nYou\'ll be asked about them after you draw.',
      instructions_font_params))
    this.instructions_1.add(this.add_colorshape(DCols[0], 0, [-450, 265]))
    this.instructions_1.add(this.add_colorshape(DCols[1], 1, [-300, 265]))
    this.instructions_1.add(this.add_colorshape(DCols[2], 2, [-150, 265]))
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
      `In the experiment, you'll see the same pattern in blocks of about ${this.phase_len * 2 + this.test_len} trials.\nTry to score well on each pattern. The experiment ends after [b]5 patterns[/b].\nIf you do well enough on the first 4, you'll get to skip the last one!`,
      instructions_font_params))
    this.instructions_2.add(this.add.rexBBCodeText(-500, -50,
      `Trials may be interspersed with questions about colored shapes, as you\nsaw in the practice rounds.`,
      instructions_font_params))
    this.instructions_2.add(this.add.rexBBCodeText(-500, 100,
      '[b]Click the arrow begin the experiment.[/b]',
      instructions_font_params))
    this.instructions_2.setVisible(false)

  } // end create


  show_instructions(mode) {
    this.pattern.setVisible(false)
    this.pattern_border.setVisible(false)
    this.rewardText.setVisible(false)
    this.shapeQuestion.setVisible(false)
    this.shapeResponse.setVisible(false)
    this.arrow_back.setVisible(false)
    // this.canvas.setVisible(false)
    this.colorshapes.forEach(p => p.destroy())
    this.distractors.forEach(p => p.destroy())
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
    let positions = shuffle([
      [-380, 0], [380, 0],
      [-380, 400], [380, 400],
      [-420, -100], [420, -100],
      [-450, 300], [450, 300],
      [-500, 100], [500, 100],
      [-450, 0], [450, 0]
      ])
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
        this.show_instructions(this.instruct_mode)
        
      }

      break
    case states.PRETRIAL:
      if (this.entering) {
        this.entering = false
        console.log("Entering PRETRIAL")
        if (this.instruct_mode == 1) {
          this.arrow_back.setVisible(true)
          if (this.trial_success_count < 2) {
            this.trial_type = 'draw'
          } else if (this.trial_success_count < 4) {
            this.trial_type = 'single'
          } else {
            this.trial_type = 'double'
          }
        } else {
          if (this.task_phase != 2) {
            this.trial_type = 'draw'
          } else if (this.subject_type == 1) {
            this.trial_type = 'single'
          } else if (this.subject_type == 2) {
            this.trial_type = 'double'
          }
        }
        // how long you have to be inside circle to start trial
        this.hold_val = randint(300, 600)

        this.shapeQuestion.setVisible(false)
        this.shapeResponse.setVisible(false)
        this.rewardText.setVisible(false)
        this.origin_obj.setVisible(true).setFillStyle(LIGHTGRAY)
        this.hold_waiting = false
        
        this.distractors = []
        this.colorshapes = []

        this.pretrial_time = this.game.loop.now
        this.trial_data = {}
        this.trial_data['ix'] = this.cur_trial_ix
        this.trial_data['type'] = this.trial_type
        this.trial_data['phase'] = this.task_phase
        this.trial_data['step'] = this.task_step
        this.trial_data['shape_id'] = this.difficulty + '_' + this.pattern_id
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
        // console.log(this.trial_data['pretrial_time'], 'pretrial_time')
        // console.log(0, 'start_time')

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
        // px = Math.max(MIN_X, Math.min(MAX_X, px))
        // py = Math.max(MIN_Y, Math.min(MAX_Y, py))
        this.draw_points.push(this.add.image(px, py, 'brush').setTint(LIGHTGRAY).setScale(.5).setAlpha(.5).setDepth(-2).setVisible(false))
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
            this.shapeAnswer = this.create_distractors(this.cs_ids['colors'], this.cs_ids['shapes'])
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

        if (this.task_phase != 3 ) {
          for (let p of this.draw_points) {p.setVisible(true)}
        }
        
        for (let p of this.distractors) {
          p.destroy()
        }
        this.origin_obj.setVisible(false)
        this.pattern.setVisible(false)
        this.pattern_border.setVisible(false)

        this.end_time = this.game.loop.now
        // gives incorrect results if we didn't move this trial
        this.trial_data['end_time'] = this.end_time - this.start_time
        this.trial_data['trial_time'] = this.end_time - this.move_time
        // console.log(this.trial_data['trial_time'], 'trial time')

        this.trial_data['pointer_data'] = this.pointer_data
        // console.log(this.trial_data)

        if (this.trial_error === Err.none) {
          // no error happened
          // calculate score
          let y0 = this.pointer_data.y[0]
          let user_p = [this.pointer_data.x, this.pointer_data.y.map(y => -(y - y0))]
          let real_p = [this.pattern_json[this.pattern_id][0].map(x => x * DRAWING_SIZE), this.pattern_json[this.pattern_id][1].map(y => y * DRAWING_SIZE)]
          let pairs = toPairs(user_p, real_p)
          let score = shapeSimilarity(pairs[0], pairs[1], { estimationPoints: 80, checkRotations: false });
          this.score = Math.pow(score, 3)
          console.log('score', score)

          if (this.instruct_mode == 1) {this.arrow_back.setVisible(false)}

          this.score = Math.round(score * 1000) / 10
          if (this.task_phase != 3) {
            this.rewardText.setText(`Your shape score was ${this.score}.`)
          } else {
            this.rewardText.setText(`Your shape score is hidden.`)
          }
          
          this.time.delayedCall(TRIAL_DELAY, () => {
            if (this.trial_type == 'single' || this.trial_type == 'double') {
              this.state = states.SHAPES
              for (let p of this.draw_points) {p.destroy()}
            } else {
              this.trial_data['shape_correct'] = 1
              this.trial_success_count++
              this.trial_data['error'] = this.trial_error
              this.trial_data['score'] = this.score
              this.all_trial_data.push(this.trial_data)
              this.next_trial()
              for (let p of this.draw_points) {p.destroy()}
            }
          })
        } else {
          // some error happened
          if (this.instruct_mode == 1) {
            this.trial_success_count = Math.max(this.trial_success_count - 2, 0)
          }
          if (this.trial_error === Err.too_slow_move) {
            this.rewardText.setText('Please start your movement faster.')
          }
          this.score = 0
          this.trial_data['error'] = this.trial_error
          this.trial_data['score'] = this.score
          this.all_trial_data.push(this.trial_data)
          this.time.delayedCall(TRIAL_PUNISH_DELAY, () => {
            this.next_trial()
            for (let p of this.draw_points) {p.destroy()}
          })
        }
        this.rewardText.setVisible(true)
        // if (this.instruct_mode === 0) {
        //   this.points_count += this.reward
        //   this.points_txt.setText('Points: ' + this.points_count)
        // }
        
        

        // console.log(`reward: ${this.reward}; success count: ${this.trial_success_count}`)

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
        this.shapeResponse.setVisible(false)
        this.shapeQuestion.setVisible(false)
        // this.canvas.setVisible(false)
        this.rewardText.setVisible(false)
        if (this.instruct_mode == 1) {this.arrow_back.setVisible(true)}

        if (this.trial_type != 'shapes') {
          this.trial_data['shape_correct'] = 1
        }

        if (this.trial_type != 'double') {
          let cid, sid;
          if (this.shapeAnswer == 0) {
            cid = this.cs_ids['colors'][0]
            sid = this.cs_ids['shapes'][0]
          } else if (this.shapeAnswer == 1) {
            cid = this.cs_ids['colors'][1]
            sid = this.cs_ids['shapes'][0]
          } else if (this.shapeAnswer == 2) {
            cid = this.cs_ids['colors'][0]
            sid = this.cs_ids['shapes'][1]
          } else {
            cid = this.cs_ids['colors'][1]
            sid = this.cs_ids['shapes'][1]
          }
          let dColor = ['blue', 'orange', 'purple'][cid]
          let dShape = ['square', 'circle', 'triangle'][sid]
          this.shapeQuestion.setText(`Please click the ${dColor} ${dShape}:`).setVisible(true)
        } else {
          this.shapeQuestion.setText('Please click the shape missing from the drawing phase:').setVisible(true)
        }
        console.log(this.shapeAnswer)
        this.show_colorshapes(this.cs_ids['colors'], this.cs_ids['shapes'])

        for (let i = 0; i < 4; i++) {
          this.colorshapes[i].setInteractive()
          //   .on('pointerover', () => this.game.canvas.style.cursor = 'pointer' )
          //   .on('pointerout', () => this.game.canvas.style.cursor = 'default' )
          if (i == this.shapeAnswer) {
            this.colorshapes[i].once('pointerdown', () => {
              this.shapeResponse.setText('Correct!').setStyle({color: BRIGHTGREEN}).setVisible(true)
              this.trial_success_count++
              if (this.instruct_mode == 1) {this.arrow_back.setVisible(false)}
              this.colorshapes.forEach(p => p.destroy())
              this.colorshapes = []
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
              this.colorshapes.forEach(p => p.destroy())
              this.colorshapes = []
              if (this.instruct_mode == 1) {this.arrow_back.setVisible(false)}
              this.shapeResponse.setText('Incorrect - let\'s try again.').setStyle({color: BRIGHTRED}).setVisible(true)
              this.time.delayedCall(TRIAL_PUNISH_DELAY, () => {
                if (this.instruct_mode == 1) {this.arrow_back.setVisible(true)}
                  if (this.trial_type != 'shapes') {this.trial_data['shape_correct'] = 0}
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
      // console.log(this.trial_success_count)
      if (this.trial_success_count >= 6) {
        this.instruct_mode = 2
        this.task_step = 1
        this.pattern.destroy()
        this.difficulty = '4'
        this.pattern_id = '40'
        this.pattern = this.add.image(0, PATTERN_Y, '4_40').setScale(.5).setVisible(false)
        this.pattern_json = patterns4
        this.state = states.INSTRUCT
        return
      }
      this.state = states.PRETRIAL
    } else {
      this.cur_trial_ix++
      // do some SHAPE trials, then move to phase 2
      if (this.cur_trial_ix <= this.phase_len) {
        // do nothing, you are in phase 1
        this.task_phase = 1
        this.state = states.PRETRIAL
      } else if (this.cur_trial_ix <= this.phase_len + this.miniphase_len) {
        // gap between p1 and p2, do some shape trials
        this.trial_type = 'shapes'
        this.shapeAnswer = randchoice([0,1,2,3])
        this.cs_ids = this.choose_cs_subset()
        this.state = states.SHAPES
      } else if (this.cur_trial_ix <= this.phase_len * 2 + this.miniphase_len) {
        // phase 2, where questions about shapes are asked
        this.task_phase = 2
        this.state = states.PRETRIAL
      } else if (this.cur_trial_ix <= this.phase_len * 2 + this.miniphase_len * 2) {
        // gap between p2 and p3, do some shape trials
        this.trial_type = 'shapes'
        this.shapeAnswer = randchoice([0,1,2,3])
        this.cs_ids = this.choose_cs_subset()
        this.state = states.SHAPES
      } else if (this.cur_trial_ix <= this.phase_len * 2 + this.miniphase_len * 2 + this.test_len) {
        // phase 3, test phase
        this.task_phase = 3
        this.state = states.PRETRIAL
      } else {
        // finished p3, move on to next shape
        this.cur_trial_ix = 1
        this.task_phase = 1
        this.task_step++
        this.pattern.destroy()
        if (this.task_step == 2) {
          this.difficulty = '6'
          this.pattern_id = '13'
          this.pattern = this.add.image(0, PATTERN_Y, '6_13').setScale(.5).setVisible(false)
          this.pattern_json = patterns6
          this.state = states.PRETRIAL
        } else if (this.task_step == 3) {
          this.difficulty = '6'
          this.pattern_id = '72'
          this.pattern = this.add.image(0, PATTERN_Y, '6_72').setScale(.5).setVisible(false)
          this.pattern_json = patterns6
          this.state = states.PRETRIAL
        } else if (this.task_step == 4) {
          this.difficulty = '7'
          this.pattern_id = '65'
          this.pattern = this.add.image(0, PATTERN_Y, '7_65').setScale(.5).setVisible(false)
          this.pattern_json = patterns7
          this.state = states.PRETRIAL
        } else {
          this.state = states.END
        }
      }
    }
  }
}
