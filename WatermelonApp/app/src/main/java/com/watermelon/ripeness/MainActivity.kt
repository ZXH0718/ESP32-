package com.watermelon.ripeness

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/** 基于敲击声音 FFT 主频判断西瓜熟度（参照专利 CN109459499A） */
class MainActivity : AppCompatActivity() {

    private lateinit var statusTv: TextView
    private lateinit var bigNumTv: TextView
    private lateinit var verdictTv: TextView
    private lateinit var detailTv: TextView
    private lateinit var btn: Button

    private val handler = Handler(Looper.getMainLooper())
    private var running = false

    companion object {
        private const val REQ_AUDIO = 100
        private const val SAMPLE_RATE = 44100
        private const val FFT_N = 8192          // FFT 窗长（约 0.19s）
        private const val RECORD_MS = 1200      // 录音时长
        // 主频阈值(Hz)，主频越低果越熟
        private const val FLOOR = 55.0
        private const val CEIL = 500.0
        private const val OVER_UP = 170.0   // <170 过熟 7-9
        private const val GOOD_UP = 205.0   // <205 熟 6
        private const val SHI_UP = 240.0    // <240 适熟 4-5，否则 生 1-3
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        statusTv = findViewById(R.id.status)
        bigNumTv = findViewById(R.id.bigNum)
        verdictTv = findViewById(R.id.verdict)
        detailTv = findViewById(R.id.detail)
        btn = findViewById(R.id.btn)
        btn.setOnClickListener { onDetect() }
    }

    private fun onDetect() {
        if (running) return
        val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED
        if (!granted) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.RECORD_AUDIO), REQ_AUDIO)
            return
        }
        startDetect()
    }

    private fun startDetect() {
        running = true
        btn.isEnabled = false
        btn.text = "🎤 请敲击西瓜…"
        statusTv.text = "请将手机底部贴近西瓜，敲击一次"
        Thread {
            val samples = record()
            if (samples == null) {
                handler.post { showError("无法打开麦克风") }
                return@Thread
            }
            val mag = Fft(FFT_N).fftMag(samples)
            val binHz = SAMPLE_RATE.toDouble() / FFT_N
            val iMin = (FLOOR / binHz).toInt().coerceAtLeast(1)
            val iMax = (CEIL / binHz).toInt().coerceAtMost(FFT_N / 2)
            var peak = 0.0
            var peakIdx = iMin
            for (i in iMin..iMax) {
                if (mag[i] > peak) { peak = mag[i]; peakIdx = i }
            }
            val freq = peakIdx * binHz
            handler.post { showResult(freq) }
        }.start()
    }

    private fun record(): ShortArray? {
        val bufSize = AudioRecord.getMinBufferSize(
            SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        if (bufSize <= 0) return null
        val rec = try {
            AudioRecord(MediaRecorder.AudioSource.MIC, SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT,
                maxOf(bufSize, SAMPLE_RATE * 2))
        } catch (e: Exception) { return null }
        if (rec.state != AudioRecord.STATE_INITIALIZED) { rec.release(); return null }
        val n = SAMPLE_RATE * RECORD_MS / 1000
        val data = ShortArray(n)
        rec.startRecording()
        rec.read(data, 0, n)
        rec.release()
        val start = (n - FFT_N) / 2   // 取录音中段做窗
        return data.copyOfRange(start, start + FFT_N)
    }

    private fun showResult(freq: Double) {
        running = false
        btn.isEnabled = true
        btn.text = "🔄 再测一次"
        statusTv.text = "主频 ${Math.round(freq)} Hz"
        bigNumTv.text = Math.round(freq).toString()
        val (verdict, note) = when {
            freq < FLOOR || freq > CEIL -> "区间外" to "主频超出判断区间，请重测"
            freq < OVER_UP -> "过熟 7-9" to "频率偏低，多半过熟"
            freq < GOOD_UP -> "熟 6" to "频率适中，刚刚好"
            freq < SHI_UP -> "适熟 4-5" to "偏生，再等等更甜"
            else -> "生 1-3" to "频率偏高，还太生"
        }
        verdictTv.text = verdict
        detailTv.text = note
    }

    private fun showError(msg: String) {
        running = false
        btn.isEnabled = true
        btn.text = "🎤 重新检测"
        statusTv.text = "出错"
        verdictTv.text = msg
        detailTv.text = ""
    }

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<out String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_AUDIO) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startDetect()
            } else {
                Toast.makeText(this, "需要麦克风权限", Toast.LENGTH_SHORT).show()
            }
        }
    }
}