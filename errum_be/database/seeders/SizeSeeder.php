<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Size;

class SizeSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $sizes = [
            'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL',
            '22', '24', '26', '28', '30', '32', '34', '36', '38',
            '39 (US 6.5)', '40 (US 7)', '41 (US 8)', '42 (US 8.5)', 
            '43 (US 9.5)', '44 (US 10)', '45 (US 11)', '46 (US 12)'
        ];

        foreach ($sizes as $size) {
            Size::firstOrCreate(['name' => $size]);
        }
    }
}
