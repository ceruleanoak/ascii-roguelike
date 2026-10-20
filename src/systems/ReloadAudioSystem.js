/**
 * ReloadAudioSystem — the held gun's reload sounds, driven once per frame
 * from the weapon tick in Game.update(). Mechanical magazines tick once per
 * round loaded; energy guns hold a stoppable charge hum for the length of the
 * reload phase. Moved out of main.js (Code Placement Procedure).
 */
export class ReloadAudioSystem {
  constructor(game) {
    this.game = game;
    // The energy gun whose charge hum is playing, so a swap or a finished
    // reload knows which hum to stop.
    this.energyReloadItem = null;
  }

  update(item) {
    const audio = this.game.audioSystem;
    if (!item || !audio) return;

    // Mechanical magazine ticks
    if (item.consumeReloadTicks) {
      const ticks = item.consumeReloadTicks();
      for (let i = 0; i < ticks; i++) {
        audio.playSFX('mag_reload');
      }
    }

    // Energy reload state tracking — only during the reload phase, not the
    // normal post-fire cooldown that precedes it.
    const isEnergyReloading =
      item.data.weaponType === 'GUN' &&
      item.data.reloadType === 'energy' &&
      item._reloading &&
      !!item.data.reloadTime;

    if (isEnergyReloading && this.energyReloadItem !== item) {
      // Stop any prior energy reload (in case of weapon swap mid-charge)
      if (this.energyReloadItem) audio.stopSFXByName('energy_charge');
      audio.playStoppableSFX('energy_charge');
      this.energyReloadItem = item;
    } else if (!isEnergyReloading && this.energyReloadItem) {
      audio.stopSFXByName('energy_charge');
      this.energyReloadItem = null;
    }
  }
}
