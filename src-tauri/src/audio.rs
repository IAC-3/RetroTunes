use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use std::time::Duration;
use rodio::{buffer::SamplesBuffer, Decoder, OutputStream, OutputStreamHandle, Sink, Source};
use symphonia::core::audio::SampleBuffer;
use tauri::{AppHandle, Manager};
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::{FormatOptions, SeekMode, SeekTo};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::units::Time;
use symphonia::default::{get_codecs, get_probe};

pub struct PlaybackEngine {
  _stream: OutputStream,
  handle: OutputStreamHandle,
  sink: Option<Arc<Sink>>,
  sink_active: Option<Arc<AtomicBool>>,
  paused: bool,
  volume: f32,
  current_path: Option<String>,
  current_position: u64,
}

impl PlaybackEngine {
  pub fn new() -> Result<Self, String> {
    let (stream, handle) = OutputStream::try_default().map_err(|e| e.to_string())?;
    Ok(Self {
      _stream: stream,
      handle,
      sink: None,
      sink_active: None,
      paused: false,
      volume: 1.0,
      current_path: None,
      current_position: 0,
    })
  }

  pub fn stop(&mut self) {
    if let Some(active) = self.sink_active.take() {
      active.store(false, Ordering::SeqCst);
    }
    if let Some(sink) = self.sink.take() {
      sink.stop();
    }
    self.paused = false;
  }

  pub fn pause(&mut self) {
    if let Some(sink) = self.sink.as_ref() {
      sink.pause();
      self.paused = true;
    }
  }

  pub fn resume(&mut self) {
    if let Some(sink) = self.sink.as_ref() {
      sink.play();
      self.paused = false;
    }
  }

  pub fn set_volume(&mut self, volume: f32) {
    self.volume = volume;
    if let Some(sink) = self.sink.as_ref() {
      sink.set_volume(volume);
    }
  }

  pub fn play_path(&mut self, path: &str, app_handle: AppHandle) -> Result<(), String> {
    self.play_path_at(path, 0, app_handle)
  }

  pub fn play_path_at(&mut self, path: &str, start_seconds: u64, app_handle: AppHandle) -> Result<(), String> {
    self.stop();
    let file = File::open(path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);
    let sink = Sink::try_new(&self.handle).map_err(|e| e.to_string())?;
    let sink = Arc::new(sink);
    sink.set_volume(self.volume);

    if let Ok(decoder) = Decoder::new(reader) {
      if start_seconds > 0 {
        sink.append(decoder.skip_duration(Duration::from_secs(start_seconds)));
      } else {
        sink.append(decoder);
      }
    } else if start_seconds == 0 {
      let source = decode_audio_file(path)?;
      sink.append(source);
    } else {
      let source = decode_audio_file_at(path, start_seconds)?;
      sink.append(source);
    }

    sink.play();
    let active = Arc::new(AtomicBool::new(true));
    self.spawn_end_thread(app_handle.clone(), sink.clone(), active.clone());
    self.sink_active = Some(active);
    self.sink = Some(sink);
    self.current_path = Some(path.to_string());
    self.current_position = start_seconds;
    self.paused = false;
    Ok(())
  }

  pub fn seek(&mut self, seconds: u64, app_handle: AppHandle) -> Result<(), String> {
    if let Some(path) = self.current_path.clone() {
      self.play_path_at(&path, seconds, app_handle)
    } else {
      Err("No active track to seek".to_string())
    }
  }

  fn spawn_end_thread(&self, app_handle: AppHandle, sink: Arc<Sink>, active: Arc<AtomicBool>) {
    std::thread::spawn(move || {
      sink.sleep_until_end();
      if active.load(Ordering::SeqCst) {
        let _ = app_handle.emit_all("playback-ended", ());
      }
    });
  }
}

fn decode_audio_file(path: &str) -> Result<SamplesBuffer<f32>, String> {
  let file = File::open(path).map_err(|e| e.to_string())?;
  let mss = MediaSourceStream::new(Box::new(file), Default::default());
  let mut hint = Hint::new();
  if let Some(ext) = Path::new(path).extension().and_then(|ext| ext.to_str()) {
    hint.with_extension(ext);
  }

  let probed = get_probe().format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
    .map_err(|e| format!("Failed to probe audio file: {}", e))?;
  let mut format = probed.format;
  let chosen_track = format.tracks().iter()
    .find(|track| track.codec_params.codec != CODEC_TYPE_NULL)
    .ok_or_else(|| "No audio track found".to_string())?;

  let track_id = chosen_track.id;
  let codec_params = chosen_track.codec_params.clone();

  let mut decoder = get_codecs()
    .make(&codec_params, &DecoderOptions::default())
    .map_err(|e| format!("Failed to create decoder: {}", e))?;

  let mut samples = Vec::new();
  let mut sample_rate = 0;
  let mut channels = 0;

  loop {
    match format.next_packet() {
      Ok(packet) => {
        if packet.track_id() != track_id {
          continue;
        }

        let decoded = decoder.decode(&packet).map_err(|e| format!("Decode failed: {}", e))?;
        let spec = *decoded.spec();

        if sample_rate == 0 {
          sample_rate = spec.rate;
          channels = spec.channels.count() as u16;
        }

        let mut buffer = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
        buffer.copy_interleaved_ref(decoded);
        samples.extend_from_slice(buffer.samples());
      }
      Err(SymphoniaError::IoError(_)) => break,
      Err(SymphoniaError::DecodeError(_)) => continue,
      Err(SymphoniaError::ResetRequired) => {
        decoder.reset();
      }
      Err(e) => return Err(format!("Audio decode error: {}", e)),
    }
  }

  if sample_rate == 0 || channels == 0 {
    return Err("No audio samples decoded".to_string());
  }

  Ok(SamplesBuffer::new(channels, sample_rate, samples))
}

fn decode_audio_file_at(path: &str, start_seconds: u64) -> Result<SamplesBuffer<f32>, String> {
  let file = File::open(path).map_err(|e| e.to_string())?;
  let mss = MediaSourceStream::new(Box::new(file), Default::default());
  let mut hint = Hint::new();
  if let Some(ext) = Path::new(path).extension().and_then(|ext| ext.to_str()) {
    hint.with_extension(ext);
  }

  let probed = get_probe().format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
    .map_err(|e| format!("Failed to probe audio file: {}", e))?;
  let mut format = probed.format;
  let chosen_track = format.tracks().iter()
    .find(|track| track.codec_params.codec != CODEC_TYPE_NULL)
    .ok_or_else(|| "No audio track found".to_string())?;

  let track_id = chosen_track.id;
  let codec_params = chosen_track.codec_params.clone();

  let time = Time::from(start_seconds);
  format.seek(SeekMode::Coarse, SeekTo::Time { time, track_id: Some(track_id) })
    .map_err(|e| format!("Failed to seek audio file: {}", e))?;

  let mut decoder = get_codecs()
    .make(&codec_params, &DecoderOptions::default())
    .map_err(|e| format!("Failed to create decoder: {}", e))?;

  let mut samples = Vec::new();
  let mut sample_rate = 0;
  let mut channels = 0;

  loop {
    match format.next_packet() {
      Ok(packet) => {
        if packet.track_id() != track_id {
          continue;
        }

        let decoded = decoder.decode(&packet).map_err(|e| format!("Decode failed: {}", e))?;
        let spec = *decoded.spec();

        if sample_rate == 0 {
          sample_rate = spec.rate;
          channels = spec.channels.count() as u16;
        }

        let mut buffer = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
        buffer.copy_interleaved_ref(decoded);
        samples.extend_from_slice(buffer.samples());
      }
      Err(SymphoniaError::IoError(_)) => break,
      Err(SymphoniaError::DecodeError(_)) => continue,
      Err(SymphoniaError::ResetRequired) => {
        decoder.reset();
      }
      Err(e) => return Err(format!("Audio decode error: {}", e)),
    }
  }

  if sample_rate == 0 || channels == 0 {
    return Err("No audio samples decoded".to_string());
  }

  Ok(SamplesBuffer::new(channels, sample_rate, samples))
}

pub enum AudioCommand {
  Play { path: String, volume: f32, app_handle: AppHandle },
  Pause,
  Resume,
  Stop,
  SetVolume(f32),
  Seek { seconds: u64, app_handle: AppHandle },
}

pub struct AudioController(pub std::sync::mpsc::Sender<AudioCommand>);

impl AudioController {
  pub fn new(sender: std::sync::mpsc::Sender<AudioCommand>) -> Self {
    Self(sender)
  }
}
