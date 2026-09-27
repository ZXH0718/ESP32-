package com.zxh.autoclicker

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {

    private lateinit var etX: EditText
    private lateinit var etY: EditText
    private lateinit var etInterval: EditText
    private lateinit var tvStatus: TextView
    private lateinit var btnStart: Button
    private lateinit var btnStop: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(buildUi())

        findViewById<Button>(R.id.btnEnable).setOnClickListener {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }

        btnStart.setOnClickListener {
            val x = etX.text.toString().toFloatOrNull() ?: 0f
            val y = etY.text.toString().toFloatOrNull() ?: 0f
            val ms = etInterval.text.toString().toLongOrNull() ?: 1000L
            AutoClickService.configure(x, y, ms)
            AutoClickService.start()
            refreshControls()
        }

        btnStop.setOnClickListener {
            AutoClickService.stop()
            refreshControls()
        }

        AutoClickService.statusListener = { msg ->
            runOnUiThread { tvStatus.text = msg }
        }
    }

    override fun onResume() {
        super.onResume()
        refreshControls()
    }

    override fun onDestroy() {
        AutoClickService.statusListener = null
        super.onDestroy()
    }

    private fun refreshControls() {
        tvStatus.text =
            if (isServiceEnabled()) "无障碍服务已开启"
            else "未开启无障碍服务，请先开启"
        btnStart.isEnabled = isServiceEnabled()
        btnStop.isEnabled = AutoClickService.running
    }

    private fun isServiceEnabled(): Boolean {
        val enabled = Settings.Secure.getString(
            contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: ""
        return enabled.split(':').any {
            it.equals(componentName.flattenToString(), ignoreCase = true)
        }
    }

    private fun buildUi(): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(24), dp(18), dp(18))

            addView(title("连点器 v1.0"))
            addView(hint("请先开启无障碍服务，然后设置点击坐标与间隔，点击“开始”自动连点。"))

            etX = textInput("X 坐标", "200")
            addView(inputRow("X 坐标", etX))

            etY = textInput("Y 坐标", "800")
            addView(inputRow("Y 坐标", etY))

            etInterval = textInput("输入间隔", "1000")
            addView(inputRow("间隔(毫秒)", etInterval))

            addView(spacer())

            tvStatus = title("")
            addView(tvStatus)

            addView(spacer())

            addView(button("开启无障碍服务", R.id.btnEnable))
            addView(spacerSmall())

            btnStart = button("开 始", R.id.btnStart)
            addView(btnStart)
            addView(spacerSmall())

            btnStop = button("停 止", R.id.btnStop)
            addView(btnStop)
        }
    }

    private fun inputRow(label: String, field: EditText): LinearLayout {
        val tv = TextView(this).apply {
            text = label
            textSize = 14f
        }
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(tv)
            addView(field)
            addView(spacerSmall())
        }
    }

    private fun title(text: String) = TextView(this).apply {
        this.text = text
        textSize = 17f
        setPadding(0, dp(4), 0, dp(8))
    }

    private fun hint(text: String) = TextView(this).apply {
        this.text = text
        textSize = 13f
        setPadding(0, 0, 0, dp(12))
    }

    private fun textInput(hint: String, default: String = "") = EditText(this).apply {
        this.hint = hint
        setText(default)
        inputType = android.text.InputType.TYPE_CLASS_NUMBER or
            android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL
    }

    private fun button(label: String, id: Int): Button {
        return Button(this).apply {
            text = label
            this.id = id
            gravity = Gravity.CENTER
        }
    }

    private fun spacer() = View(this).apply { layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(8)) }
    private fun spacerSmall() = View(this).apply { layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(4)) }
    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()
}