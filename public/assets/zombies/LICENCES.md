# Zombies : sources et licences

Personnages et animations **Adobe Mixamo** (libres de droits pour un usage dans un jeu selon les conditions Mixamo ; redistribution des fichiers bruts interdite), tirés de la bibliothèque privée `sabrilab/mixamo-library`. Conversion : `tools/zombies/` (squelette sans préfixe, clips reciblés sur place, textures 1024 px, EXT_meshopt_compression + quantification ; textures avec découpe alpha en WebP via EXT_texture_webp).

Clips humanoïdes (animations « Liam ») : `z_idle` zombie_idle (1), `z_idle2` zombie_scratch_idle, `z_walk` zombie_walk, `z_run` zombie_run, `z_attack` zombie_attack, `z_punch` zombie_punching (1), `z_bite` zombie_neck_bite, `z_headbutt` zombie_headbutt (1), `z_kick` zombie_kicking, `z_hit` zombie_reaction_hit, `z_death` zombie_death, `z_scream` zombie_scream, `z_crawl` zombie_crawl, `z_standup` zombie_stand_up (1).

Clips du mastodonte (CreaturePackBeta) : `z_idle` mutant_breathing_idle, `z_walk` mutant_walking, `z_run` mutant_run, `z_attack` mutant_swiping, `z_punch` mutant_punch, `z_scream` mutant_roaring, `z_jump` mutant_jump_attack, `z_death` mutant_dying, `z_hit` zombie_reaction_hit (Liam).

| fichier | FBX source | clips | triangles | taille | texture |
| --- | --- | --- | --- | --- | --- |
| rodeur.glb | Zombie.fbx | 14 humanoïdes | 13 024 | 1,72 Mo | JPEG |
| policier.glb | Copzombie_L_Actisdato.fbx | 14 humanoïdes | 9 845 | 1,44 Mo | WebP + alphaTest |
| femme.glb | Zombiegirl_W_Kurniawan.fbx | 14 humanoïdes | 7 448 | 1,40 Mo | WebP + alphaTest |
| soldat.glb | Warzombie_F_Pedroso.fbx | 14 humanoïdes | 14 934 | 1,87 Mo | JPEG |
| contamine.glb | Parasite_L_Starkie.fbx | 14 humanoïdes | 10 856 | 1,55 Mo | WebP + alphaTest |
| decharne.glb | Skeletonzombie_T_Avelange.fbx | 14 humanoïdes | 12 486 | 1,63 Mo | WebP + alphaTest |
| mastodonte.glb | Mutant.fbx | 9 (mutant) | 11 270 | 1,29 Mo | JPEG |
