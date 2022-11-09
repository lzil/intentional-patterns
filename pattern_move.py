import json
import os
import shutil

thumbnails = {
	4: [0],
	6: [29, 21],
	8: [57]
}

for k,v in thumbnails.items():
	os.makedirs(os.path.join('public', 'patterns', f'figs_{k}'), exist_ok=True)

	for ix in v:
		png_path = os.path.join('patterns', f'figs_{k}', f'{k}_{ix}-t.png')
		new_png_path = os.path.join('public', 'patterns', f'figs_{k}', f'{k}_{ix}-t.png')
		shutil.copy(png_path, new_png_path)

patterns = {
	4: [40, 41],
	6: [5, 13, 72],
	7: [65],
	8: [18]
}

for k,v in patterns.items():
	path = os.path.join('patterns', f'p{k}.json')
	os.makedirs(os.path.join('public', 'patterns', f'figs_{k}'), exist_ok=True)
	new_path = os.path.join('public', 'patterns', f'p{k}_filtered.json')

	with open(path, 'r') as f:
		data = json.load(f)

	new_data = {}
	for ix in v:
		new_data[str(ix)] = data[str(ix)]
		png_path = os.path.join('patterns', f'figs_{k}', f'{k}_{ix}.png')
		new_png_path = os.path.join('public', 'patterns', f'figs_{k}', f'{k}_{ix}.png')
		shutil.copy(png_path, new_png_path)

	with open(new_path, 'w') as f:
		json.dump(new_data, f, indent=2)