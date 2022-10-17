import numpy as np
import scipy as sp
from scipy import interpolate as ip
import matplotlib.pyplot as plt
import matplotlib.animation as ani
import matplotlib.cm as cm
import pandas as pd

import pdb
import json
import pickle
from pathlib import Path
import argparse

import fig_format

Set2 = cm.Set2

ap = argparse.ArgumentParser()
ap.add_argument('path', type=str, help='json file to use')
ap.add_argument('ids', type=int, nargs='+', help='ids to turn into image')
args = ap.parse_args()

dif = args.path.split('.')[-2].split('_')[-1]

with open(Path(args.path), 'r') as f:
	trajs = json.load(f)

fig = plt.figure(figsize=(5,5))

fig_dir = Path('patterns', 'figs_' + dif)
Path.mkdir(fig_dir, parents=True, exist_ok=True)
for i in args.ids:
	x, y = trajs[str(i)]

	plt.xlim([-.5, .5])
	plt.ylim([-.5, .5])
	plt.axis('off')

	plt.plot(x, y, color='#aaa', lw=10, zorder=-1)

	plt.scatter(x[0], y[0], color=Set2(0), s=400)
	plt.scatter(x[-1], y[-1], color=Set2(1), s=400)

	plt.savefig(Path(fig_dir, dif + '_' + str(i) + '.png'))

	plt.cla()


# nd_pat = 100
# n_points = 8

# trajectories = []

# for i in range(nd_pat):
# 	t = np.linspace(0, 1, n_points)
# 	x, y = np.insert(np.random.rand(2, n_points-1).clip(.2,.8) - .5, 0, 0, 1)
# 	spl = ip.make_interp_spline(t, np.c_[x, y], 3)

# 	t_new = np.linspace(0, 1, 150)
# 	x_new, y_new = spl(t_new).T
# 	trajectories.append((t_new, x_new, y_new))


# fig, axes = plt.subplots(10, 10, sharex=True, sharey=True, figsize=(20,20))
# axes[0,0].set_xlim([-.5,.5])
# axes[0,0].set_ylim([-.5,.5])

# for i,ax in enumerate(fig.axes):
# 	t, x, y = trajectories[i]
# 	# pdb.set_trace()
# 	ax.set_title(i)
# 	ax.plot(x, y, c='red', lw=1)

# plt.savefig(Path('patterns', f'patterns_{n_points}.png'))

# with open(Path('patterns', f'patterns_{n_points}.json'), 'wb') as f:
# 	pickle.dump(trajectories, f)

# def buildmebarchart(i=int):
#     # plt.legend(df1.columns)
#     p = plt.plot(x_new[:i], y_new[:i], c='red') #note it only returns the dataset, up to the point i
#     # for i in range(0,4):
#     #     p[i].set_color(color[i]) #set the colour of each curveimport matplotlib.animation as ani
# animator = ani.FuncAnimation(fig, buildmebarchart, interval = 10)



# plt.show()