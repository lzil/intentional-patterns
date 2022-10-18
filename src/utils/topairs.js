

// calculates score between two curves
export default function toPairs(t1_, t2_) {
  // change format from [[xs], [ys]] to [[x0,y0], ...]
  let t1_pairs = []
  for (let i = 0; i < t1_[0].length; i++) {
    t1_pairs.push({'x': t1_[0][i], 'y': t1_[1][i]})
  }
  let t2_pairs = []
  for (let i = 0; i < t2_[0].length; i++) {
    t2_pairs.push({'x': t2_[0][i], 'y': t2_[1][i]})
  }

  return [t1_pairs, t2_pairs]

}