#!/usr/bin/env python3
"""QLoRA para Qwen2.5-Instruct con un JSONL de conversaciones messages."""
import argparse
import json
import random
from pathlib import Path

import torch
from datasets import Dataset
from peft import LoraConfig, prepare_model_for_kbit_training
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, set_seed
from trl import SFTConfig, SFTTrainer


def cargar_jsonl(ruta):
    registros = []
    with open(ruta, encoding="utf-8") as archivo:
        for numero, linea in enumerate(archivo, 1):
            if not linea.strip():
                continue
            try:
                mensajes = json.loads(linea)["messages"]
                if not isinstance(mensajes, list) or not mensajes:
                    raise ValueError("messages debe ser una lista no vacía")
                if not any(m.get("role") == "assistant" for m in mensajes):
                    raise ValueError("falta respuesta assistant")
                if any(m.get("role") not in {"system", "user", "assistant"} or not isinstance(m.get("content"), str) for m in mensajes):
                    raise ValueError("roles o contenidos no válidos")
                registros.append(mensajes)
            except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
                raise ValueError(f"Error en línea {numero}: {exc}") from exc
    if len(registros) < 2:
        raise ValueError("Se necesitan al menos dos ejemplos")
    return registros


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--datos", default="jose_vicente_carratala_entrenamiento.jsonl")
    parser.add_argument("--modelo", default="Qwen/Qwen2.5-7B-Instruct")
    parser.add_argument("--salida", default="./qwen-jocarsa-lora")
    parser.add_argument("--epocas", type=float, default=5)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--longitud", type=int, default=512)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if not torch.cuda.is_available():
        raise SystemExit("QLoRA con bitsandbytes requiere una GPU CUDA compatible")
    set_seed(args.seed)
    bf16 = torch.cuda.is_bf16_supported()
    print("GPU:", torch.cuda.get_device_name(0), "| BF16:", bf16)

    tokenizer = AutoTokenizer.from_pretrained(args.modelo)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    ejemplos = cargar_jsonl(args.datos)
    random.Random(args.seed).shuffle(ejemplos)
    n_validacion = max(1, round(len(ejemplos) * 0.1))
    validacion = ejemplos[:n_validacion]
    entrenamiento = ejemplos[n_validacion:]

    def convertir(registros):
        return Dataset.from_list([
            {"text": tokenizer.apply_chat_template(mensajes, tokenize=False, add_generation_prompt=False)}
            for mensajes in registros
        ])

    datos_train = convertir(entrenamiento)
    datos_eval = convertir(validacion)
    print(f"Entrenamiento: {len(datos_train)} | Validación: {len(datos_eval)}")

    cuantizacion = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=torch.bfloat16 if bf16 else torch.float16,
    )
    modelo = AutoModelForCausalLM.from_pretrained(
        args.modelo,
        quantization_config=cuantizacion,
        device_map={"": torch.cuda.current_device()},
        torch_dtype=torch.bfloat16 if bf16 else torch.float16,
    )
    modelo.config.use_cache = False
    modelo = prepare_model_for_kbit_training(modelo)

    lora = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    )

    config = SFTConfig(
        output_dir=args.salida,
        num_train_epochs=args.epocas,
        per_device_train_batch_size=1,
        per_device_eval_batch_size=1,
        gradient_accumulation_steps=8,
        gradient_checkpointing=True,
        learning_rate=args.lr,
        lr_scheduler_type="cosine",
        warmup_ratio=0.1,
        optim="paged_adamw_8bit",
        weight_decay=0.01,
        logging_steps=1,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        greater_is_better=False,
        bf16=bf16,
        fp16=not bf16,
        max_length=args.longitud,
        packing=False,
        dataset_text_field="text",
        report_to="none",
        seed=args.seed,
    )

    entrenador = SFTTrainer(
        model=modelo,
        args=config,
        train_dataset=datos_train,
        eval_dataset=datos_eval,
        peft_config=lora,
        processing_class=tokenizer,
    )
    entrenador.train()
    entrenador.save_model(args.salida)
    tokenizer.save_pretrained(args.salida)
    Path(args.salida, "modelo_base.txt").write_text(args.modelo + "\n", encoding="utf-8")
    print("Adaptador guardado en:", Path(args.salida).resolve())


if __name__ == "__main__":
    main()
