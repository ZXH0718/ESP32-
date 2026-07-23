package com.esp32.musicbox

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.*
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.GradientDrawable
import android.os.*
import android.util.Log
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.material.progressindicator.LinearProgressIndicator
import com.google.android.material.snackbar.Snackbar
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "MusicSender"
        private val UUID_SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
        private const val TARGET = "ESP32_MusicBox"
        private const val HEADER = 0xAB.toByte()
        private const val BUF = 1024
        private const val REPLY_TIMEOUT = 30000L
    }

    // 蓝牙
    private var btAdapter: BluetoothAdapter? = null
    private var btSocket: BluetoothSocket? = null
    private var btDevice: BluetoothDevice? = null
    private var scanning = false
    private var connected = false
    private val devices = mutableListOf<BluetoothDevice>()

    // 文件
    private var fileUri: android.net.Uri? = null
    private var fileName: String? = null
    private var fileSize: Long = 0
    private var transferring = false

    // 历史 (最多5条)
    data class Record(val name: String, val size: Long, val status: Int, val time: String)
    private val history = mutableListOf<Record>()

    // UI
    private lateinit var statusDot: View
    private lateinit var tvStatus: TextView
    private lateinit var deviceContainer: LinearLayout
    private lateinit var tvNoDevices: TextView
    private lateinit var btnScan: com.google.android.material.button.MaterialButton
    private lateinit var btnDisconnect: com.google.android.material.button.MaterialButton
    private lateinit var tvFileInfo: TextView
    private lateinit var progressBar: LinearProgressIndicator
    private lateinit var tvProgress: TextView
    private lateinit var btnPickFile: com.google.android.material.button.MaterialButton
    private lateinit var btnSendFile: com.google.android.material.button.MaterialButton
    private lateinit var tvHistory: TextView
    private lateinit var tvEmptyHistory: TextView
    private lateinit var btnClearHistory: com.google.android.material.button.MaterialButton
    private lateinit var cardRemote: com.google.android.material.card.MaterialCardView
    private lateinit var tvRemoteStatus: TextView
    private lateinit var tvRemoteVolume: TextView
    private lateinit var btnPlayPause: com.google.android.material.button.MaterialButton
    private lateinit var btnPrev: com.google.android.material.button.MaterialButton
    private lateinit var btnNext: com.google.android.material.button.MaterialButton
    private lateinit var btnVolUp: com.google.android.material.button.MaterialButton
    private lateinit var btnVolDown: com.google.android.material.button.MaterialButton
    private lateinit var btnSyncTime: com.google.android.material.button.MaterialButton

    private val executor = Executors.newSingleThreadExecutor()
    private val handler = Handler(Looper.getMainLooper())

    private lateinit var permLauncher: ActivityResultLauncher<Array<String>>
    private lateinit var fileLauncher: ActivityResultLauncher<Intent>
    private lateinit var btEnableLauncher: ActivityResultLauncher<Intent>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        initViews()
        initLaunchers()
        initBluetooth()
        checkPermissions()
    }

    override fun onDestroy() {
        super.onDestroy()
        stopScan()
        disconnect()
        executor.shutdown()
    }

    private fun initViews() {
        statusDot = findViewById(R.id.status_dot)
        tvStatus = findViewById(R.id.tv_status)
        deviceContainer = findViewById(R.id.device_list_container)
        tvNoDevices = findViewById(R.id.tv_no_devices)
        btnScan = findViewById(R.id.btn_scan)
        btnDisconnect = findViewById(R.id.btn_disconnect)
        tvFileInfo = findViewById(R.id.tv_file_info)
        progressBar = findViewById(R.id.progress_bar)
        tvProgress = findViewById(R.id.tv_progress)
        btnPickFile = findViewById(R.id.btn_pick_file)
        btnSendFile = findViewById(R.id.btn_send_file)
        tvHistory = findViewById(R.id.tv_history)
        tvEmptyHistory = findViewById(R.id.tv_empty_history)
        btnClearHistory = findViewById(R.id.btn_clear_history)

        btnScan.setOnClickListener {
            if (scanning) stopScan()
            else if (hasPerms()) {
                if (btAdapter?.isEnabled == true) startScan()
                else btEnableLauncher.launch(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE))
            } else checkPermissions()
        }

        btnDisconnect.setOnClickListener { disconnect() }
        btnPickFile.setOnClickListener { pickFile() }
        btnSendFile.setOnClickListener { sendFile() }
        btnClearHistory.setOnClickListener {
            history.clear()
            refreshHistory()
        }
                  cardRemote = findViewById(R.id.card_remote)
                  tvRemoteStatus = findViewById(R.id.tv_remote_status)
                  tvRemoteVolume = findViewById(R.id.tv_remote_volume)
                  btnPlayPause = findViewById(R.id.btn_play_pause)
                  btnPrev = findViewById(R.id.btn_prev)
                  btnNext = findViewById(R.id.btn_next)
                  btnVolUp = findViewById(R.id.btn_vol_up)
                  btnVolDown = findViewById(R.id.btn_vol_down)
                  btnSyncTime = findViewById(R.id.btn_sync_time)
                  btnSyncTime.setOnClickListener { syncTime() }
                  btnPlayPause.setOnClickListener { sendBtCommand(0xC0.toByte()) }
                  btnPrev.setOnClickListener { sendBtCommand(0xC1.toByte()) }
                  btnNext.setOnClickListener { sendBtCommand(0xC2.toByte()) }
                  btnVolUp.setOnClickListener { sendBtCommand(0xC3.toByte()) }
                  btnVolDown.setOnClickListener { sendBtCommand(0xC4.toByte()) }
    }

    private fun initLaunchers() {
        permLauncher = registerForActivityResult(
            ActivityResultContracts.RequestMultiplePermissions()
        ) { perms ->
            if (perms.entries.all { it.value }) onPermsGranted()
            else snack("缺少必要权限")
        }

        fileLauncher = registerForActivityResult(
            ActivityResultContracts.StartActivityForResult()
        ) { result ->
            if (result.resultCode == RESULT_OK) result.data?.data?.let { onFilePicked(it) }
        }

        btEnableLauncher = registerForActivityResult(
            ActivityResultContracts.StartActivityForResult()
        ) { result ->
            if (result.resultCode == RESULT_OK) onBtEnabled()
            else {
                tvStatus.text = "蓝牙未开启"
                setDotColor(R.color.status_disconnected)
            }
        }
    }

    private fun initBluetooth() {
        btAdapter = (getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
        if (btAdapter == null) {
            tvStatus.text = "设备不支持蓝牙"
            btnScan.isEnabled = false
        }
    }

    // ==================== 权限 ====================

    private fun checkPermissions() {
        val list = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN)
                != PackageManager.PERMISSION_GRANTED
            ) list.add(Manifest.permission.BLUETOOTH_SCAN)
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT)
                != PackageManager.PERMISSION_GRANTED
            ) list.add(Manifest.permission.BLUETOOTH_CONNECT)
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED
            ) list.add(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_AUDIO)
                != PackageManager.PERMISSION_GRANTED
            ) list.add(Manifest.permission.READ_MEDIA_AUDIO)
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED
            ) list.add(Manifest.permission.READ_EXTERNAL_STORAGE)
        }
        if (list.isNotEmpty()) permLauncher.launch(list.toTypedArray())
        else onPermsGranted()
    }

    private fun hasPerms(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN)
                == PackageManager.PERMISSION_GRANTED &&
                ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT)
                == PackageManager.PERMISSION_GRANTED
        } else {
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
        }
    }

    private fun onPermsGranted() {
        if (btAdapter?.isEnabled == true) onBtEnabled()
        else btEnableLauncher.launch(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE))
    }

    @SuppressLint("MissingPermission")
    private fun onBtEnabled() {
        tvStatus.text = getString(R.string.status_disconnected)
        setDotColor(R.color.status_disconnected)
        loadBonded()
        startScan()
    }

    @SuppressLint("MissingPermission")
    private fun loadBonded() {
        btAdapter?.bondedDevices?.find { it.name == TARGET }?.let {
            devices.clear()
            devices.add(it)
            refreshDeviceList()
        }
    }

    // ==================== 扫描 ====================

    @SuppressLint("MissingPermission")
    private fun startScan() {
        if (scanning || transferring) return
        btAdapter ?: return

        devices.clear()
        btAdapter?.bondedDevices?.forEach { d ->
            if (d.name == TARGET && devices.none { it.address == d.address }) devices.add(d)
        }

        scanning = true
        updateScanUI(true)

        executor.execute {
            try { btAdapter?.startDiscovery() }
            catch (e: SecurityException) {
                handler.post { scanning = false; updateScanUI(false) }
            } catch (_: Exception) {
                handler.post { scanning = false; updateScanUI(false) }
            }
        }

        handler.postDelayed({ if (scanning) stopScan() }, 12000)
    }

    @SuppressLint("MissingPermission")
    private fun stopScan() {
        if (!scanning) return
        scanning = false
        try { btAdapter?.cancelDiscovery() } catch (_: SecurityException) {}
        updateScanUI(false)
    }

    private fun updateScanUI(isScanning: Boolean) {
        if (isScanning) {
            btnScan.text = getString(R.string.btn_stop_scan)
            tvStatus.text = getString(R.string.status_scanning)
            setDotColor(R.color.status_scanning)
        } else {
            btnScan.text = getString(R.string.btn_scan)
            if (!connected) {
                tvStatus.text = getString(R.string.status_disconnected)
                setDotColor(R.color.status_disconnected)
            }
        }
        refreshDeviceList()
    }

    private fun refreshDeviceList() {
        deviceContainer.removeAllViews()
        if (devices.isEmpty()) {
            deviceContainer.visibility = View.GONE
            tvNoDevices.visibility = View.VISIBLE
            if (!scanning) tvNoDevices.text = getString(R.string.no_devices)
        } else {
            deviceContainer.visibility = View.VISIBLE
            tvNoDevices.visibility = View.GONE
            devices.forEach { d ->
                val name = try { d.name ?: "未知" } catch (_: SecurityException) { "无权限" }
                val tv = TextView(this).apply {
                    text = "$name\n${d.address}"
                    textSize = 14f
                    setPadding(16, 12, 16, 12)
                    setTextColor(
                        if (name == TARGET) ContextCompat.getColor(this@MainActivity, R.color.primary)
                        else ContextCompat.getColor(this@MainActivity, R.color.text_primary)
                    )
                    setBackgroundColor(
                        ContextCompat.getColor(this@MainActivity, android.R.color.transparent)
                    )
                    setBackgroundResource(android.R.drawable.list_selector_background)
                    isClickable = true
                    isFocusable = true
                    gravity = Gravity.CENTER_VERTICAL
                    setOnClickListener {
                        if (!connected && !transferring) connectDevice(d)
                    }
                }
                deviceContainer.addView(tv)
                if (d != devices.last()) {
                    val div = View(this).apply {
                        layoutParams = LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT, 1
                        )
                        setBackgroundColor(ContextCompat.getColor(this@MainActivity, R.color.divider))
                    }
                    deviceContainer.addView(div)
                }
            }
        }
    }

    // ==================== 连接 ====================

    @SuppressLint("MissingPermission")
    private fun connectDevice(device: BluetoothDevice) {
        if (connected || transferring) return
        stopScan()
        tvStatus.text = getString(R.string.status_connecting)
        setDotColor(R.color.status_scanning)

        executor.execute {
            var socket: BluetoothSocket? = null
            try {
                socket = device.createRfcommSocketToServiceRecord(UUID_SPP)
                btSocket = socket
                socket.connect()
                onConnected(device, socket)
            } catch (e: IOException) {
                try { socket?.close() } catch (_: IOException) {}
                var fb: BluetoothSocket? = null
                try {
                    val m = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
                    fb = m.invoke(device, 1) as BluetoothSocket
                    btSocket = fb
                    fb.connect()
                    onConnected(device, fb)
                } catch (e2: Exception) {
                    closeQuietly(fb)
                    handler.post { showConnError(e2.message ?: "未知错误") }
                }
            } catch (e: SecurityException) {
                closeQuietly(socket)
                handler.post { showConnError("安全异常: ${e.message}") }
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun onConnected(device: BluetoothDevice, socket: BluetoothSocket) {
        btDevice = device
        connected = true
        handler.post {
            tvStatus.text = getString(R.string.status_connected, device.name)
            setDotColor(R.color.status_connected)
            btnDisconnect.visibility = View.VISIBLE
            btnScan.visibility = View.GONE
            deviceContainer.visibility = View.GONE
            tvNoDevices.visibility = View.GONE
            updateSendBtn()
                    cardRemote.visibility = View.VISIBLE
                    btnSyncTime.visibility = View.VISIBLE
                    tvRemoteVolume.visibility = View.VISIBLE
                    snack("已连接到 ${device.name}")
        }
        startReceive(socket)
    }

    private fun startReceive(socket: BluetoothSocket) {
        executor.execute {
            try {
                val ins = socket.inputStream
                val buf = ByteArray(256)
                while (connected && socket.isConnected) {
                    val avail = ins.available()
                    if (avail > 0) {
                        val n = ins.read(buf, 0, minOf(avail, buf.size))
                        if (n > 0) {
                            val reply = String(buf, 0, n).trim()
                            Log.d(TAG, "ESP32回复: $reply")
                            handler.post {
                                when {
                                    reply.startsWith("{") -> handleStatusJson(reply)
                                    reply.startsWith("OK") -> updateSendingRecord(true)
                                    reply.startsWith("ERR") -> updateSendingRecord(false, "设备错误: $reply")
                                }
                            }
                        }
                    } else SystemClock.sleep(100)
                }
            } catch (_: IOException) {
                if (connected) handler.post { handleLost() }
            }
        }
    }

    private fun showConnError(msg: String) {
        tvStatus.text = getString(R.string.conn_failed, msg)
        setDotColor(R.color.status_error)
        snack(getString(R.string.conn_failed, msg))
    }

    private fun disconnect() {
        if (transferring) { snack("文件传输中，请等待完成"); return }
        connected = false
        btDevice = null
        executor.execute {
            try { btSocket?.close() } catch (_: IOException) {}
            btSocket = null
        }
        tvStatus.text = getString(R.string.status_disconnected)
        setDotColor(R.color.status_disconnected)
        btnDisconnect.visibility = View.GONE
        btnScan.visibility = View.VISIBLE
        cardRemote.visibility = View.GONE
        btnSyncTime.visibility = View.GONE
        tvRemoteVolume.visibility = View.GONE
        tvRemoteStatus.text = getString(R.string.remote_status)
        updateSendBtn()
    }

    private fun handleLost() {
        if (!connected) return
        connected = false
        btDevice = null
        transferring = false
        executor.execute {
            try { btSocket?.close() } catch (_: IOException) {}
            btSocket = null
        }
        handler.post {
            tvStatus.text = getString(R.string.conn_lost)
            setDotColor(R.color.status_error)
            btnDisconnect.visibility = View.GONE
            btnScan.visibility = View.VISIBLE
            btnSendFile.isEnabled = false
            progressBar.visibility = View.GONE
            tvProgress.visibility = View.GONE
            updateSendingRecord(false, "连接已断开")
            cardRemote.visibility = View.GONE
            btnSyncTime.visibility = View.GONE
            tvRemoteVolume.visibility = View.GONE
            snack(getString(R.string.conn_lost))
        }
    }

    private fun closeQuietly(s: BluetoothSocket?) { try { s?.close() } catch (_: IOException) {} }

    // ==================== 文件 ====================

    private fun pickFile() {
        val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
            type = "audio/*"
            addCategory(Intent.CATEGORY_OPENABLE)
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf(
                "audio/mpeg", "audio/wav", "audio/x-wav", "audio/flac", "audio/x-flac"
            ))
        }
        fileLauncher.launch(Intent.createChooser(intent, "选择音频文件"))
    }

    private fun onFilePicked(uri: android.net.Uri) {
        fileUri = uri
        fileName = queryName(uri)
        fileSize = querySize(uri)

        val ext = fileName?.substringAfterLast('.', "")?.lowercase() ?: ""
        if (ext !in listOf("mp3", "wav", "flac")) {
            snack(getString(R.string.error_invalid_file))
            fileUri = null; fileName = null; fileSize = 0
            tvFileInfo.text = getString(R.string.file_not_selected)
            updateSendBtn()
            return
        }

        tvFileInfo.text = getString(R.string.file_selected, fileName, fmtSize(fileSize))
        updateSendBtn()
    }

    private fun queryName(uri: android.net.Uri): String {
        var name = "未知文件"
        contentResolver.query(uri, null, null, null, null)?.use { c ->
            val i = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (c.moveToFirst() && i >= 0) name = c.getString(i)
        }
        return name
    }

    private fun querySize(uri: android.net.Uri): Long {
        var size = 0L
        contentResolver.query(uri, null, null, null, null)?.use { c ->
            val i = c.getColumnIndex(android.provider.OpenableColumns.SIZE)
            if (c.moveToFirst() && i >= 0) size = c.getLong(i)
        }
        return size
    }

    private fun fmtSize(s: Long): String = when {
        s >= 1024 * 1024 -> String.format(getString(R.string.file_size_mb), s / (1024.0 * 1024.0))
        s >= 1024 -> String.format(getString(R.string.file_size_kb), s / 1024.0)
        else -> "$s B"
    }

    // ==================== 发送 ====================

    private fun sendFile() {
        val uri = fileUri ?: return
        val name = fileName ?: return
        if (!connected) { snack("请先连接设备"); return }
        if (transferring) { snack("正在传输中"); return }

        transferring = true
        btnSendFile.isEnabled = false
        btnPickFile.isEnabled = false
        progressBar.visibility = View.VISIBLE
        progressBar.isIndeterminate = false
        progressBar.progress = 0
        tvProgress.visibility = View.VISIBLE
        tvStatus.text = getString(R.string.status_transferring)
        setDotColor(R.color.status_transferring)

        val time = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
        history.add(0, Record(name, fileSize, 2, time))
        refreshHistory()

        executor.execute {
            var ok = false
            var err = ""
            try {
                val ins = contentResolver.openInputStream(uri) ?: throw IOException("无法打开文件")
                val sock = btSocket ?: throw IOException("蓝牙未连接")
                val out = sock.outputStream
                val nameBytes = name.toByteArray(Charsets.UTF_8)

                // 构建协议头: [0xAB][filename][0x00][size 4B LE]
                val hdr = ByteArray(1 + nameBytes.size + 1 + 4)
                var off = 0
                hdr[off] = HEADER; off++
                System.arraycopy(nameBytes, 0, hdr, off, nameBytes.size); off += nameBytes.size
                hdr[off] = 0; off++
                hdr[off] = (fileSize and 0xFF).toByte()
                hdr[off + 1] = ((fileSize shr 8) and 0xFF).toByte()
                hdr[off + 2] = ((fileSize shr 16) and 0xFF).toByte()
                hdr[off + 3] = ((fileSize shr 24) and 0xFF).toByte()

                out.write(hdr); out.flush()
                Log.d(TAG, "头已发送: ${hdr.size}字节")

                val buf = ByteArray(BUF)
                var sent = 0L
                var n: Int
                while (ins.read(buf).also { n = it } != -1) {
                    if (!connected) throw IOException("蓝牙已断开")
                    out.write(buf, 0, n); out.flush()
                    sent += n
                    val s = sent; val t = fileSize
                    handler.post { updateProgress(s, t) }
                }
                ins.close()

                val reply = waitReply(sock)
                if (reply.startsWith("OK")) {
                    ok = true; Log.d(TAG, "传输成功: $name")
                } else {
                    err = "设备返回: $reply"; Log.e(TAG, "传输失败: $reply")
                }
            } catch (e: SecurityException) { err = "权限异常: ${e.message}" }
            catch (e: IOException) { err = "IO异常: ${e.message}" }
            catch (e: Exception) { err = "异常: ${e.message}" }

            val fOk = ok; val fErr = err; val fN = name
            handler.post { onTransferDone(fOk, fErr, fN) }
        }
    }

    private fun waitReply(socket: BluetoothSocket): String {
        val start = System.currentTimeMillis()
        val buf = ByteArray(64)
        val sb = StringBuilder()
        while (System.currentTimeMillis() - start < REPLY_TIMEOUT) {
            if (!connected) break
            try {
                val avail = socket.inputStream.available()
                if (avail > 0) {
                    val n = socket.inputStream.read(buf, 0, minOf(avail, buf.size))
                    if (n > 0) {
                        sb.append(String(buf, 0, n))
                        val r = sb.toString()
                        if (r.contains("\n")) return r.substringBefore("\n").trim()
                    }
                } else SystemClock.sleep(50)
            } catch (e: IOException) { throw IOException("等待回复断开: ${e.message}") }
        }
        val p = sb.toString().trim()
        return if (p.isNotEmpty()) p else "TIMEOUT"
    }

    private fun updateProgress(sent: Long, total: Long) {
        if (total <= 0) return
        val pct = ((sent * 100) / total).toInt().coerceIn(0, 100)
        progressBar.progress = pct
        tvProgress.text = getString(R.string.progress_text, sent / 1024, total / 1024, pct)
    }

    private fun onTransferDone(ok: Boolean, err: String, name: String) {
        transferring = false
        btnPickFile.isEnabled = true
        progressBar.visibility = View.GONE
        tvProgress.visibility = View.GONE
        if (connected) {
            tvStatus.text = getString(R.string.status_connected, btDevice?.name ?: "")
            setDotColor(R.color.status_connected)
            updateSendBtn()
        }
        if (ok) {
            updateSendingRecord(true)
            snack(getString(R.string.transfer_ok, name))
        } else {
            updateSendingRecord(false, err)
            snack(getString(R.string.transfer_err, err))
        }
    }

    // ==================== 历史记录 ====================

    private fun updateSendingRecord(success: Boolean, err: String = "") {
        val i = history.indexOfFirst { it.status == 2 }
        if (i >= 0) history[i] = history[i].copy(status = if (success) 0 else 1)
        refreshHistory()
    }

    private fun refreshHistory() {
        if (history.isEmpty()) {
            tvHistory.visibility = View.GONE
            tvEmptyHistory.visibility = View.VISIBLE
            btnClearHistory.visibility = View.GONE
        } else {
            tvHistory.visibility = View.VISIBLE
            tvEmptyHistory.visibility = View.GONE
            btnClearHistory.visibility = View.VISIBLE
            val sb = StringBuilder()
            history.take(5).forEach { r ->
                val status = when (r.status) {
                    0 -> "成功"
                    1 -> "失败"
                    else -> "发送中"
                }
                sb.append("${r.time}  ${r.name}  ${fmtSize(r.size)}  [$status]\n")
            }
            tvHistory.text = sb.trimEnd()
        }
    }

    // ==================== UI辅助 ====================

    private fun setDotColor(colorRes: Int) {
        val c = ContextCompat.getColor(this, colorRes)
        (statusDot.background.mutate() as? GradientDrawable)?.setColor(c)
    }

    private fun updateSendBtn() {
        btnSendFile.isEnabled = connected && fileUri != null && !transferring
    }

    private fun snack(msg: String) {
        Snackbar.make(findViewById(android.R.id.content), msg, Snackbar.LENGTH_LONG).show()
    }

    private fun sendBtCommand(cmd: Byte) {
        if (!connected || transferring) return
        executor.execute {
            try {
                btSocket?.outputStream?.write(byteArrayOf(cmd))
                btSocket?.outputStream?.flush()
                // 发送播放控制命令后自动查询状态
                if (cmd.toInt() in 0xC0..0xC4) {
                    SystemClock.sleep(200)
                    btSocket?.outputStream?.write(byteArrayOf(0xC5))
                    btSocket?.outputStream?.flush()
                }
            } catch (e: IOException) {
                handler.post { handleLost() }
            }
        }
    }

    private fun handleStatusJson(json: String) {
        try {
            val obj = org.json.JSONObject(json)
            val playing = obj.optBoolean("playing", false)
            val paused = obj.optBoolean("paused", false)
            val vol = obj.optInt("vol", 0)
            val song = obj.optString("song", "")
            val idx = obj.optInt("index", 0)
            val total = obj.optInt("total", 0)
            if (playing) tvRemoteStatus.text = getString(R.string.remote_playing, song)
            else if (paused) tvRemoteStatus.text = getString(R.string.remote_paused, song)
            else tvRemoteStatus.text = getString(R.string.remote_status)
            tvRemoteVolume.text = getString(R.string.remote_volume, vol)
            tvRemoteVolume.visibility = View.VISIBLE
        } catch (_: Exception) {}
    }

    private fun syncTime() {
        if (!connected || transferring) return
        executor.execute {
            try {
                val ts = System.currentTimeMillis() / 1000L
                val buf = byteArrayOf(0xD0.toByte(),
                    ((ts shr 24) and 0xFF).toByte(),
                    ((ts shr 16) and 0xFF).toByte(),
                    ((ts shr 8) and 0xFF).toByte(),
                    (ts and 0xFF).toByte())
                btSocket?.outputStream?.write(buf)
                btSocket?.outputStream?.flush()
                handler.post { snack("时间同步指令已发送") }
            } catch (e: IOException) {
                handler.post { handleLost() }
            }
        }
    }

    // ==================== 广播 ====================

    private val btReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            when (intent?.action) {
                BluetoothDevice.ACTION_FOUND -> {
                    val device: BluetoothDevice? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                    }
                    device?.let {
                        val name = try { it.name } catch (_: SecurityException) { null }
                        if (name != null && devices.none { d -> d.address == it.address }) {
                            devices.add(it)
                            refreshDeviceList()
                        }
                        if (name == TARGET && !connected) stopScan()
                    }
                }
                BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
                    if (scanning) stopScan()
                    if (devices.isEmpty()) refreshDeviceList()
                }
                BluetoothDevice.ACTION_ACL_DISCONNECTED -> {
                    if (connected) handleLost()
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        val f = IntentFilter().apply {
            addAction(BluetoothDevice.ACTION_FOUND)
            addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
            addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
            registerReceiver(btReceiver, f, RECEIVER_NOT_EXPORTED)
        else
            registerReceiver(btReceiver, f)
    }

    override fun onPause() {
        super.onPause()
        try { unregisterReceiver(btReceiver) } catch (_: IllegalArgumentException) {}
    }
}
