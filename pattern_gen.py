import numpy as np
import scipy as sp
from scipy import interpolate as ip
import matplotlib.pyplot as plt
import matplotlib.animation as ani
import pandas as pd

import pdb
import json
import pickle
import argparse
from pathlib import Path

import fig_format

ap = argparse.ArgumentParser()
ap.add_argument('n_points', type=int, help='number of points')
args = ap.parse_args()

nd_pat = 100
n_points = args.n_points

trajectories = {}
trajectories_json = {}

for i in range(nd_pat):
	t = np.linspace(0, 1, n_points)
	x, y = np.insert(np.random.rand(2, n_points-1).clip(.2,.8) - .5, 0, 0, 1)
	spl = ip.make_interp_spline(t, np.c_[x, y], 3)

	t_new = np.linspace(0, 1, 150)
	x_new, y_new = spl(t_new).T
	trajectories[i] = (list(x_new), list(y_new))


fig, axes = plt.subplots(10, 10, sharex=True, sharey=True, figsize=(20,20))
axes[0,0].set_xlim([-.5,.5])
axes[0,0].set_ylim([-.5,.5])

for i,ax in enumerate(fig.axes):
	x, y = trajectories[i]
	# pdb.set_trace()
	ax.set_title(i)
	ax.plot(x, y, c='red', lw=1)

plt.savefig(Path('patterns', f'p{n_points}.png'))

with open(Path('patterns', f'p{n_points}.json'), 'w') as f:
	json.dump(trajectories, f, indent=2)