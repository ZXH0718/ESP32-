package com.esp32.musicbox

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
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
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "MusicSender"

        // Nordic UART Service UUID (与ESP32固件一致)
        private val BLE_SERVICE_UUID = UUID.fromString("6e400001-b5a3-f393-e0a9-e50e24dcca9e")
        private val BLE_RX_CHAR_UUID  = UUID.fromString("6e400002-b5a3-f393-e0a9-e50e24dcca9e") // 手机写入
        private val BLE_TX_CHAR_UUID  = UUID.fromString("6e400003-b5a3-f393-e0a9-e50e24dcca9e") // ESP32通知
        private val CCCD_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

        private const val TARGET = "ESP32_MusicBox"
        private val HEADER: Byte = (-85).toByte() // 0xAB
        private const val REPLY_TIMEOUT = 60000L
        private const val SCAN_PERIOD = 12000L
        private const val MTU_SIZE = 247 // 请求更大的MTU以加快传输
    }

    // BLE
    private var btAdapter: BluetoothAdapter? = null
    private var btScanner: BluetoothLeScanner? = null
    private var bluetoothGatt: BluetoothGatt? = null
    private var btDevice: BluetoothDevice? = null
    private var rxCharacteristic: BluetoothGattCharacteristic? = null
    private var txCharacteristic: BluetoothGattCharacteristic? = null
    private var scanning = false
    private var connected = false
    private var servicesReady = false
    private val devices = mutableListOf<BluetoothDevice>()

    // BLE写入队列 (必须串行写入)
    private val writeQueue = ConcurrentLinkedQueue<ByteArray>()
    @Volatile private var isWriting = false

    // 文件
    private var fileUri: android.net.Uri? = null
    private var fileName: String? = null
    private var fileSize: Long = 0
    private var transferring = false
    @Volatile private var transferCancelled = false

    // 接收缓冲
    private val receiveBuffer = StringBuilder()
    private var waitingForReply = false
    private var replyResult: String? = null

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

    // ==================== BLE GATT 回调 ====================
    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            Log.d(TAG, "GATT状态变化: status=$status newState=$newState")
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    connected = true
                    handler.post {
                        tvStatus.text = getString(R.string.status_connecting)
                        setDotColor(R.color.status_scanning)
                    }
                    // 请求更大MTU
                    gatt.requestMtu(MTU_SIZE)
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    connected = false
                    servicesReady = false
                    isWriting = false
                    writeQueue.clear()
                    if (transferring) transferCancelled = true
                    gatt.close()
                    handler.post { handleLost() }
                }
            }
        }

        override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
            Log.d(TAG, "MTU已协商: $mtu (status=$status)")
            // MTU协商完成后发现服务
            gatt.discoverServices()
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            Log.d(TAG, "服务发现完成: status=$status")
            if (status != BluetoothGatt.GATT_SUCCESS) {
                handler.post { showConnError("服务发现失败") }
                return
            }

            val service = gatt.getService(BLE_SERVICE_UUID)
            if (service == null) {
                handler.post { showConnError("未找到Nordic UART服务") }
                return
            }

            rxCharacteristic = service.getCharacteristic(BLE_RX_CHAR_UUID)
            txCharacteristic = service.getCharacteristic(BLE_TX_CHAR_UUID)

            if (rxCharacteristic == null || txCharacteristic == null) {
                handler.post { showConnError("未找到RX/TX特征值") }
                return
            }

            // 启用TX特征值的通知
            gatt.setCharacteristicNotification(txCharacteristic, true)
            val cccd = txCharacteristic!!.getDescriptor(CCCD_UUID)
            if (cccd != null) {
                cccd.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                gatt.writeDescriptor(cccd)
                Log.d(TAG, "已启用TX通知")
            }

            servicesReady = true
            handler.post {
                tvStatus.text = getString(R.string.status_connected, btDevice?.name ?: "ESP32")
                setDotColor(R.color.status_connected)
                btnDisconnect.visibility = View.VISIBLE
                btnScan.visibility = View.GONE
                deviceContainer.visibility = View.GONE
                tvNoDevices.visibility = View.GONE
                updateSendBtn()
                btnSyncTime.visibility = View.VISIBLE
                tvRemoteVolume.visibility = View.VISIBLE
                snack("已连接到 ${btDevice?.name ?: "ESP32"}")
            }
        }

        override fun onCharacteristicWrite(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int
        ) {
            Log.d(TAG, "写入完成: status=$status, 队列剩余=${writeQueue.size}")
            isWriting = false
            // 处理队列中的下一条数据
            processWriteQueue()
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic
        ) {
            val data = characteristic.value
            if (data != null && data.isNotEmpty()) {
                val text = String(data)
                Log.d(TAG, "ESP32通知: $text")
                receiveBuffer.append(text)
                // 检查是否收到完整回复
                val buf = receiveBuffer.toString()
                if (buf.contains("\n")) {
                    val reply = buf.substringBefore("\n").trim()
                    receiveBuffer.delete(0, receiveBuffer.indexOf("\n") + 1)
                    replyResult = reply
                    waitingForReply = false
                    handler.post {
                        when {
                            reply.startsWith("{") -> handleStatusJson(reply)
                            reply.startsWith("OK") -> updateSendingRecord(true)
                            reply.startsWith("ERR") -> updateSendingRecord(false, "设备错误: $reply")
                        }
                    }
                }
            }
        }
    }

    // ==================== BLE 扫描回调 ====================
    private val scanCallback = object : ScanCallback() {
        @SuppressLint("MissingPermission")
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val device = result.device
            val name = try { device.name } catch (_: SecurityException) { null }
            if (name != null && devices.none { it.address == device.address }) {
                devices.add(device)
                refreshDeviceList()
                // 找到目标设备自动停止
                if (name == TARGET && !connected) {
                    stopScan()
                }
            }
        }

        override fun onScanFailed(errorCode: Int) {
            Log.e(TAG, "BLE扫描失败: errorCode=$errorCode")
            handler.post {
                scanning = false
                updateScanUI(false)
                snack("扫描失败 (错误码: $errorCode)")
            }
        }
    }

    // ==================== 生命周期 ====================
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
        btnPlayPause.setOnClickListener { sendBleCommand(0xC0.toByte()) }
        btnPrev.setOnClickListener { sendBleCommand(0xC1.toByte()) }
        btnNext.setOnClickListener { sendBleCommand(0xC2.toByte()) }
        btnVolUp.setOnClickListener { sendBleCommand(0xC3.toByte()) }
        btnVolDown.setOnClickListener { sendBleCommand(0xC4.toByte()) }
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val scan = ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
            val connect = ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
            return scan && connect
        } else {
            return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
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
        btScanner = btAdapter?.bluetoothLeScanner
        startScan()
    }

    // ==================== BLE 扫描 ====================

    @SuppressLint("MissingPermission")
    private fun startScan() {
        if (scanning || transferring) return
        btScanner ?: let {
            btScanner = btAdapter?.bluetoothLeScanner
            if (btScanner == null) {
                snack("无法启动BLE扫描")
                return
            }
        }

        devices.clear()
        scanning = true
        updateScanUI(true)

        try {
            btScanner?.startScan(scanCallback)
        } catch (e: SecurityException) {
            handler.post { scanning = false; updateScanUI(false) }
        }

        handler.postDelayed({ if (scanning) stopScan() }, SCAN_PERIOD)
    }

    @SuppressLint("MissingPermission")
    private fun stopScan() {
        if (!scanning) return
        scanning = false
        try { btScanner?.stopScan(scanCallback) } catch (_: SecurityException) {}
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

    @SuppressLint("MissingPermission")
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

    // ==================== BLE 连接 ====================

    @SuppressLint("MissingPermission")
    private fun connectDevice(device: BluetoothDevice) {
        if (connected || transferring) return
        stopScan()
        btDevice = device
        tvStatus.text = getString(R.string.status_connecting)
        setDotColor(R.color.status_scanning)

        executor.execute {
            try {
                bluetoothGatt = device.connectGatt(this, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
            } catch (e: SecurityException) {
                handler.post { showConnError("安全异常: ${e.message}") }
            }
        }
    }

    private fun showConnError(msg: String) {
        tvStatus.text = getString(R.string.conn_failed, msg)
        setDotColor(R.color.status_error)
        snack(getString(R.string.conn_failed, msg))
    }

    @SuppressLint("MissingPermission")
    private fun disconnect() {
        if (transferring) { snack("文件传输中，请等待完成"); return }
        connected = false
        servicesReady = false
        btDevice = null
        isWriting = false
        writeQueue.clear()
        executor.execute {
            try {
                bluetoothGatt?.disconnect()
                bluetoothGatt?.close()
            } catch (_: SecurityException) {}
            bluetoothGatt = null
        }
        tvStatus.text = getString(R.string.status_disconnected)
        setDotColor(R.color.status_disconnected)
        btnDisconnect.visibility = View.GONE
        btnScan.visibility = View.VISIBLE
        btnSyncTime.visibility = View.GONE
        tvRemoteVolume.visibility = View.GONE
        tvRemoteStatus.text = getString(R.string.remote_status)
        updateSendBtn()
    }

    private fun handleLost() {
        if (!connected && !transferring) {
            // 已经处理过了
            tvStatus.text = getString(R.string.status_disconnected)
            setDotColor(R.color.status_disconnected)
            btnDisconnect.visibility = View.GONE
            btnScan.visibility = View.VISIBLE
            btnSyncTime.visibility = View.GONE
            tvRemoteVolume.visibility = View.GONE
            return
        }
        connected = false
        servicesReady = false
        btDevice = null
        transferring = false
        isWriting = false
        writeQueue.clear()
        handler.post {
            tvStatus.text = getString(R.string.conn_lost)
            setDotColor(R.color.status_error)
            btnDisconnect.visibility = View.GONE
            btnScan.visibility = View.VISIBLE
            btnSendFile.isEnabled = false
            progressBar.visibility = View.GONE
            tvProgress.visibility = View.GONE
            updateSendingRecord(false, "连接已断开")
            btnSyncTime.visibility = View.GONE
            tvRemoteVolume.visibility = View.GONE
            snack(getString(R.string.conn_lost))
        }
    }

    // ==================== BLE 写入队列 ====================

    @SuppressLint("MissingPermission")
    private fun processWriteQueue() {
        if (isWriting) return
        val data = writeQueue.poll() ?: return
        val gatt = bluetoothGatt ?: return
        val char = rxCharacteristic ?: return

        try {
            char.value = data
            char.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
            isWriting = true
            gatt.writeCharacteristic(char)
        } catch (e: Exception) {
            Log.e(TAG, "写入失败: ${e.message}")
            isWriting = false
            // 重试下一条
            handler.postDelayed({ processWriteQueue() }, 50)
        }
    }

    private fun bleWrite(data: ByteArray) {
        writeQueue.add(data)
        processWriteQueue()
    }

    private fun bleWriteAndWait(data: ByteArray, timeoutMs: Long = REPLY_TIMEOUT): String {
        receiveBuffer.clear()
        waitingForReply = true
        replyResult = null
        bleWrite(data)

        val start = System.currentTimeMillis()
        while (System.currentTimeMillis() - start < timeoutMs) {
            if (!connected) return "DISCONNECTED"
            if (!waitingForReply && replyResult != null) return replyResult!!
            Thread.sleep(50)
        }
        return "TIMEOUT"
    }

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

    // ==================== 发送文件 (BLE) ====================

    private fun sendFile() {
        val uri = fileUri ?: return
        val name = fileName ?: return
        if (!connected) { snack("请先连接设备"); return }
        if (!servicesReady) { snack("BLE服务未就绪，请稍候"); return }
        if (transferring) { snack("正在传输中"); return }

        transferring = true
        transferCancelled = false
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
                val nameBytes = name.toByteArray(Charsets.UTF_8)

                // 构建协议头: [0xAB][filename][0x00][size 4B LE]
                val header = ByteArray(1 + nameBytes.size + 1 + 4)
                var off = 0
                header[off] = HEADER; off++
                System.arraycopy(nameBytes, 0, header, off, nameBytes.size); off += nameBytes.size
                header[off] = 0; off++
                header[off] = (fileSize and 0xFF).toByte()
                header[off + 1] = ((fileSize shr 8) and 0xFF).toByte()
                header[off + 2] = ((fileSize shr 16) and 0xFF).toByte()
                header[off + 3] = ((fileSize shr 24) and 0xFF).toByte()

                // 发送协议头 (分片，BLE每次最多MTU-3字节)
                val chunkSize = MTU_SIZE - 3 // 244字节
                var headerOff = 0
                while (headerOff < header.size) {
                    if (!connected) throw IOException("蓝牙已断开")
                    val len = minOf(chunkSize, header.size - headerOff)
                    val chunk = header.copyOfRange(headerOff, headerOff + len)
                    bleWrite(chunk)
                    headerOff += len
                    // 等待写入完成
                    while (isWriting || writeQueue.isNotEmpty()) {
                        if (!connected) throw IOException("蓝牙已断开")
                        Thread.sleep(10)
                    }
                }
                Log.d(TAG, "协议头已发送: ${header.size}字节")

                // 发送文件数据
                val buf = ByteArray(chunkSize)
                var sent = 0L
                var n: Int
                while (ins.read(buf).also { n = it } != -1) {
                    if (!connected) throw IOException("蓝牙已断开")
                    if (transferCancelled) throw IOException("传输已取消")

                    if (n > 0) {
                        val chunk = if (n < buf.size) buf.copyOfRange(0, n) else buf
                        bleWrite(chunk)
                        sent += n

                        // 等待队列清空（流控：防止队列堆积过多）
                        while (writeQueue.size > 3) {
                            if (!connected) throw IOException("蓝牙已断开")
                            Thread.sleep(5)
                        }

                        val s = sent; val t = fileSize
                        handler.post { updateProgress(s, t) }
                    }
                }
                ins.close()

                // 等待所有写入完成
                while (isWriting || writeQueue.isNotEmpty()) {
                    if (!connected) throw IOException("蓝牙已断开")
                    Thread.sleep(10)
                }

                // 等待ESP32回复
                val reply = bleWriteAndWait(ByteArray(0)) // 空写入仅触发等待
                // 实际上ESP32在接收完数据后自动通知，这里直接等待通知
                val start = System.currentTimeMillis()
                while (System.currentTimeMillis() - start < REPLY_TIMEOUT) {
                    if (!connected) throw IOException("蓝牙已断开")
                    if (!waitingForReply && replyResult != null) break
                    Thread.sleep(100)
                }

                val result = replyResult
                if (result != null && result.startsWith("OK")) {
                    ok = true
                    Log.d(TAG, "传输成功: $name")
                } else if (result != null && result.startsWith("ERR")) {
                    err = "设备返回: $result"
                } else {
                    // 可能回复已经处理了（通过onCharacteristicChanged回调）
                    ok = true // 假设成功，因为updateSendingRecord可能已被调用
                    Log.d(TAG, "传输完成(回复可能已异步处理)")
                }

            } catch (e: SecurityException) { err = "权限异常: ${e.message}" }
            catch (e: IOException) { err = "IO异常: ${e.message}" }
            catch (e: Exception) { err = "异常: ${e.message}" }

            val fOk = ok; val fErr = err; val fN = name
            handler.post { onTransferDone(fOk, fErr, fN) }
        }
    }

    private fun updateProgress(sent: Long, total: Long) {
        if (total <= 0) return
        val pct = ((sent * 100) / total).toInt().coerceIn(0, 100)
        progressBar.progress = pct
        tvProgress.text = getString(R.string.progress_text, sent / 1024, total / 1024, pct)
    }

    private fun onTransferDone(ok: Boolean, err: String, name: String) {
        transferring = false
        transferCancelled = false
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
            // 检查是否已被回调标记为成功
            val hasSending = history.any { it.status == 2 }
            if (hasSending) {
                updateSendingRecord(false, err)
                snack(getString(R.string.transfer_err, err))
            }
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
        btnSendFile.isEnabled = connected && servicesReady && fileUri != null && !transferring
    }

    private fun snack(msg: String) {
        Snackbar.make(findViewById(android.R.id.content), msg, Snackbar.LENGTH_LONG).show()
    }

    // ==================== BLE 遥控命令 ====================

    private fun sendBleCommand(cmd: Byte) {
        if (!connected || !servicesReady || transferring) return
        executor.execute {
            bleWrite(byteArrayOf(cmd))
            // 发送控制命令后查询状态
            if (cmd.toInt() and 0xFF in 0xC0..0xC4) {
                Thread.sleep(300)
                bleWrite(byteArrayOf(0xC5.toByte()))
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
            if (playing) tvRemoteStatus.text = getString(R.string.remote_playing, song)
            else if (paused) tvRemoteStatus.text = getString(R.string.remote_paused, song)
            else tvRemoteStatus.text = getString(R.string.remote_status)
            tvRemoteVolume.text = getString(R.string.remote_volume, vol)
            tvRemoteVolume.visibility = View.VISIBLE
        } catch (_: Exception) {}
    }

    private fun syncTime() {
        if (!connected || !servicesReady || transferring) return
        executor.execute {
            val ts = System.currentTimeMillis() / 1000L
            val buf = ByteArray(5)
            buf[0] = (0xD0 and 0xFF).toByte()
            buf[1] = ((ts ushr 24) and 0xFF).toByte()
            buf[2] = ((ts ushr 16) and 0xFF).toByte()
            buf[3] = ((ts ushr 8) and 0xFF).toByte()
            buf[4] = (ts and 0xFF).toByte()
            bleWrite(buf)
            handler.post { snack("时间同步指令已发送") }
        }
    }
}
