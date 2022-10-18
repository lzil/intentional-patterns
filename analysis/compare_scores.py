import numpy as np
import pandas as pd
import json
import matplotlib.pyplot as plt
import scipy.stats as st

import pdb
import sys
sys.path.append('../')
import fig_format

data_str = 'v1_debug'
data_path = f'data/patterns_{data_str}.json'

with open(data_path, 'r') as f:
	data = json.load(f)

# df = pd.read_json(data_path)

# pdb.set_trace()

p1_scores = []
p3_scores = []

difs = []

# participant = data[6]
difs = {1:[], 2:[], 3:[], 4:[]}
for participant in data:
	td = pd.DataFrame(participant['data'])
	td = td[td['set'] == 'main']

	for i in range(1,5):
		tdi = td[td['step'] == i]

		# pdb.set_trace()
		p1_score = tdi[tdi['phase'] == 1]['score']
		p3_score = tdi[tdi['phase'] == 3]['score']

		# p1_scores.append(np.mean(p1_score))
		# p3_scores.append(np.mean(p3_score))

		difs[i].append((np.mean(p1_score), np.mean(p3_score)))

# pdb.set_trace()

participant = data[2]
td = pd.DataFrame(participant['data'])
td = td[td['set'] == 'main']

tdi = td[td['step'] == 1]
pointer_data = tdi.iloc[-1].pointer_data
x, y = pointer_data['x'], pointer_data['y']
plt.plot(x, y)
plt.show()


# p1_ints = st.norm.interval(confidence=0.90,
#                  loc=np.mean(p1_scores),
#                  scale=st.sem(p1_scores))

# p3_ints = st.norm.interval(confidence=0.90,
#                  loc=np.mean(p3_scores),
#                  scale=st.sem(p3_scores))

# pdb.set_trace()



# for i in range(1,5):
# 	uz = list(zip(*difs[i]))
# 	plt.scatter(uz[0], uz[1], label=i)

# plt.xlim([0,100])
# plt.ylim([0,100])
# plt.xlabel('phase 1 avg perf')
# plt.ylabel('phase 3 avg perf')
# plt.plot(np.arange(100), np.arange(100), lw=.5, ls='--', c='black')
# plt.legend()
# fig_format.hide_frame(plt.gca())
# plt.show()
