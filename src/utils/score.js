

// calculates score between two curves
export default function score(t1_, t2_) {
  // make sure they're the same length
  // t01 -> t1, but need to shorten it first
  let t01, t1, t2;
  if (t1_.length > t2_.length) {
    t01 = t1_
    t2 = t2_
  } else {
    t01 = t2_
    t2 = t1_
  }
  let lfactor = t01.length / t2.length

  // if they're the same length we can skip this nonsense
  if (lfactor != 1) {
    t1 = []
    for (let i = 0; i < t2.length; i++) {
      t1.push(t01[Math.round(i * lfactor)])
    }
  } else {
    t1 = t01
  }

  // now we should have two arrays of the same length t1, t2

  // normalize positions by translating
  t1 = toZero(t1)
  t2 = toZero(t2)

  // normalize sizes by scaling by avg Z
  t1 = scale(t1, 1/getAvgZ(t1))
  t2 = scale(t2, 1/getAvgZ(t2))

  // now we are ready to compare point by point

  let sumDif = 0
  for (let i = 0; i < t1.length; i++) {
    sumDif += getDist(t1[i], t2[i])
  }
  let meanDif = sumDif / t1.length

  return meanDif

}


// subtract the first element from array of 2d points
function toZero(v) {
  let x0 = v[0][0]
  let y0 = v[0][1]
  return v_new = v.map(p => [p[0] - x0, p[1] - y0])
}

// multiple all points by certain num
function scale(v, num) {
  return v.map(p => [p[0] * num, p[1] * num])
}


// get average distance from [0,0]
function getAvgZ(v) {
  let sumZ = v.reduce((sum, el) => sum + getZ(el), 0)
  return sumZ / v.length
}

// get distance from [0,0]
function getZ(p) {
  return Math.pow(Math.pow(p[0],2) + Math.pow(p[1],2), .5)
}

// get distance between two points
function getDist(p1, p2) {
  return Math.pow(Math.pow(p1[0] - p2[0],2) + Math.pow(p1[1] - p2[1],2), .5)
}