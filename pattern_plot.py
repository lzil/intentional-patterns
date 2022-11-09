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
ap.add_argument('-t', '--thumbnail', action='store_true', help='smaller image for instructions page')
ap.add_argument('ids', type=int, nargs='+', help='ids to turn into image')
args = ap.parse_args()

dif = args.path.split('.')[-2][-1]

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

    plt.gcf().set_facecolor('#ffffff')

    if not args.thumbnail:
        plt.plot(x, y, color='#aaa', lw=10, zorder=-1)
        plt.scatter(x[0], y[0], color=Set2(0), s=400)
        plt.scatter(x[-1], y[-1], color=Set2(1), s=400)
        plt.savefig(Path(fig_dir, dif + '_' + str(i) + '.png'))
    else:
        plt.plot(x, y, color='#aaa', lw=15, zorder=-1)
        plt.scatter(x[0], y[0], color=Set2(0), s=700)
        plt.scatter(x[-1], y[-1], color=Set2(1), s=700)

        plt.savefig(Path(fig_dir, dif + '_' + str(i) + '-t.png'))

    plt.cla()